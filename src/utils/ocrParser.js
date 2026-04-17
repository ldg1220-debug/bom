/**
 * Tesseract.js recognize() 결과에서 파트리스트와 도면 정보를 구조화 파싱
 */

const HEADER_KEYWORDS = ['no', 'part', 'description', 'material', 'qty', 'unit', 'spec', 'remark'];

/**
 * Tesseract TSV 출력 파싱 → 단어 + bbox 배열
 * TSV 컬럼: level page_num block par line word left top width height conf text
 */
function extractWordsFromTSV(tsv) {
  if (!tsv) return [];
  const lines = tsv.split('\n');
  const words = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 12) continue;
    const level = parseInt(cols[0]);
    if (level !== 5) continue; // 5 = word level
    const conf = parseFloat(cols[10]);
    const text = cols[11]?.trim();
    if (conf <= -1 || !text) continue; // -1 = 공백 토큰, 그 외는 모두 포함
    const left = parseInt(cols[6]);
    const top = parseInt(cols[7]);
    const w = parseInt(cols[8]);
    const h = parseInt(cols[9]);
    words.push({ text, bbox: { x0: left, y0: top, x1: left + w, y1: top + h } });
  }
  return words;
}

/**
 * OCR 단어 배열을 Y좌표 기준으로 행 그룹핑
 * yTolerance를 단어 높이 기반으로 자동 계산
 */
function groupWordsIntoRows(words) {
  if (!words || words.length === 0) return [];

  // 평균 단어 높이의 60%를 허용 오차로 사용 (해상도 무관)
  const avgHeight = words.reduce((s, w) => s + (w.bbox.y1 - w.bbox.y0), 0) / words.length;
  const yTolerance = Math.max(8, Math.round(avgHeight * 0.6));

  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const rows = [];
  let currentRow = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const word = sorted[i];
    const rowTop = currentRow[0].bbox.y0;
    if (Math.abs(word.bbox.y0 - rowTop) <= yTolerance) {
      currentRow.push(word);
    } else {
      rows.push(currentRow.sort((a, b) => a.bbox.x0 - b.bbox.x0));
      currentRow = [word];
    }
  }
  if (currentRow.length > 0) rows.push(currentRow.sort((a, b) => a.bbox.x0 - b.bbox.x0));
  return rows;
}

function rowToText(row) {
  return row.map((w) => w.text).join(' ').toLowerCase();
}

function findHeaderRowIndex(rows) {
  let bestIdx = -1;
  let bestCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const text = rowToText(rows[i]);
    const matchCount = HEADER_KEYWORDS.filter((kw) => text.includes(kw)).length;
    if (matchCount >= 2 && matchCount > bestCount) {
      bestCount = matchCount;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function parseHeaderColumns(headerRow) {
  const colKeywords = [
    { key: 'no',          aliases: ['no.', 'no', '순번', '번호'] },
    { key: 'partNumber',  aliases: ['part no', 'part', '부품번호'] },
    { key: 'description', aliases: ['description', 'desc', '품명', '부품명'] },
    { key: 'material',    aliases: ['material', 'matl', '재질', '재료'] },
    { key: 'qty',         aliases: ['qty', 'quantity', '수량'] },
    { key: 'unit',        aliases: ['unit', '단위'] },
    { key: 'specRemark',  aliases: ['spec', 'remark', 'remarks', '비고'] },
  ];

  const columns = [];
  for (const col of colKeywords) {
    for (const alias of col.aliases) {
      const matchingWord = headerRow.find((w) => w.text.toLowerCase().includes(alias));
      if (matchingWord) {
        columns.push({ key: col.key, x0: matchingWord.bbox.x0, x1: matchingWord.bbox.x1 });
        break;
      }
    }
  }
  columns.sort((a, b) => a.x0 - b.x0);
  return columns;
}

function assignWordToColumn(word, columns) {
  if (columns.length === 0) return null;
  let best = null;
  let bestDist = Infinity;
  for (const col of columns) {
    const colCenter = (col.x0 + col.x1) / 2;
    const wordCenter = (word.bbox.x0 + word.bbox.x1) / 2;
    const dist = Math.abs(wordCenter - colCenter);
    if (dist < bestDist) { bestDist = dist; best = col.key; }
  }
  return best;
}

function parseDataRow(row, columns, fallbackSeq) {
  const part = { seq: 0, partNumber: '', description: '', material: '', qty: 1, unit: 'EA', specRemark: '' };

  if (columns.length === 0) {
    const texts = row.map((w) => w.text);
    if (texts.length >= 1) part.seq = parseInt(texts[0]) || fallbackSeq;
    if (texts.length >= 2) part.partNumber = texts[1];
    if (texts.length >= 3) part.description = texts.slice(2, Math.max(2, texts.length - 2)).join(' ');
    if (texts.length >= 3) part.qty = parseFloat(texts[texts.length - 2]) || 1;
    return part;
  }

  for (const word of row) {
    const colKey = assignWordToColumn(word, columns);
    if (!colKey) continue;
    const txt = word.text.trim();
    if (colKey === 'no') {
      const num = parseInt(txt);
      if (!isNaN(num)) part.seq = num;
    } else if (colKey === 'qty') {
      const num = parseFloat(txt);
      if (!isNaN(num)) part.qty = num;
    } else if (colKey === 'unit') {
      if (txt) part.unit = txt.toUpperCase();
    } else if (colKey === 'specRemark') {
      part.specRemark += (part.specRemark ? ' ' : '') + txt;
    } else {
      part[colKey] += (part[colKey] ? ' ' : '') + txt;
    }
  }

  if (!part.seq) part.seq = fallbackSeq;
  return part;
}

/**
 * 특정 범위의 rows에서 파트 추출
 */
function extractPartsFromRange(rows, startIdx, endIdx, columns) {
  const parts = [];
  let partSeq = 1;
  for (let i = startIdx; i < endIdx; i++) {
    const rowText = rowToText(rows[i]);
    if (!rowText.trim()) continue;
    if (/approved|checked|drawn|date|scale|sheet/i.test(rowText)) continue;

    const part = parseDataRow(rows[i], columns, partSeq);
    if (part.partNumber || part.description) {
      parts.push(part);
      partSeq++;
    }
  }
  parts.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  return parts;
}

// ── 타이틀 블록 파싱 ──────────────────────────────────────────

function hasKorean(s) {
  return /[\u3130-\u318F\uAC00-\uD7AF]/.test(s);
}

/** 조립체 명칭처럼 보이는지 확인 */
function looksLikeTitle(s) {
  if (!s || s.length < 4 || s.length > 70) return false;
  if (/\d{4,}/.test(s)) return false;
  if (hasKorean(s)) return false;
  if (/[=@#$%^&*(){}\[\]|<>]/.test(s)) return false;
  return /^[A-Z][A-Z0-9\s,._\-/]+$/i.test(s);
}

/**
 * 제목 앞부분의 OCR 노이즈 제거
 * 예: "EI EE FRONT PANEL," → "FRONT PANEL,"
 * 영어 사전에 없을 법한 2~3자 단어들은 실제 제목 전 노이즈로 판단
 */
function cleanTitle(s) {
  if (!s) return s;
  // 앞의 짧은 비단어 토큰 제거 (2글자 이하이거나 모음 없는 토큰)
  const tokens = s.split(/\s+/);
  const COMMON_SHORT = new Set(['A', 'AN', 'OF', 'OR', 'TO', 'IN', 'IS', 'AT', 'ON', 'NO']);
  let startIdx = 0;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i].replace(/[^A-Z]/gi, '');
    if (t.length <= 2 && !COMMON_SHORT.has(t.toUpperCase())) {
      startIdx = i + 1;
    } else {
      break;
    }
  }
  return tokens.slice(startIdx).join(' ');
}

function parseTitleBlock(fullText) {
  const lines = fullText.split('\n').map((l) => l.trim()).filter(Boolean);
  let drawingNumber = '';
  let title = '';
  let rev = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineUp = line.toUpperCase();

    // ── REV ──
    if (!rev) {
      const m = line.match(/\bREV[:\s.]+([A-Z0-9]{1,3})\b/i);
      if (m) {
        rev = m[1].toUpperCase();
      } else if (/^REV$/i.test(line) && i + 1 < lines.length) {
        const nxt = lines[i + 1].trim();
        if (/^[A-Z0-9]{1,3}$/.test(nxt)) rev = nxt;
      }
    }

    // ── DWG NO ──
    if (!drawingNumber && (lineUp.includes('DWG') || lineUp.includes('DRAWING')) && lineUp.includes('NO')) {
      const after = line.replace(/.*(?:dwg|drawing)\s*\.?\s*no\s*\.?\s*/i, '').trim();
      const token = after.split(/\s+/)[0];
      if (token && token.length > 3 && /[A-Z0-9]/i.test(token)) {
        drawingNumber = token.toUpperCase();
      } else if (i + 1 < lines.length) {
        const nxt = lines[i + 1].trim();
        if (/[A-Z0-9-]{5,}/i.test(nxt)) drawingNumber = nxt.split(/\s+/)[0].toUpperCase();
      }
    }

    // ── TITLE ──
    if (!title && lineUp.includes('TITLE')) {
      const afterTitle = line.replace(/.*?title\s*/i, '').trim();
      if (looksLikeTitle(afterTitle)) {
        title = cleanTitle(afterTitle.toUpperCase());
        if (i + 1 < lines.length && looksLikeTitle(lines[i + 1])) {
          title += ' ' + lines[i + 1].trim().toUpperCase();
        }
      } else {
        for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
          if (looksLikeTitle(lines[j])) {
            title = cleanTitle(lines[j].trim().toUpperCase());
            if (j + 1 < lines.length && looksLikeTitle(lines[j + 1])) {
              title += ' ' + lines[j + 1].trim().toUpperCase();
            }
            break;
          }
        }
      }
    }
  }

  // ── 도면번호 폴백: 하이픈 포함 영숫자 패턴 ──
  if (!drawingNumber) {
    for (const line of lines) {
      // RM-LC01-FC23344 패턴: 2~4글자-2~6글자-1~2글자+3+숫자
      const m = line.match(/([A-Z]{2,4}-[A-Z0-9]{2,6}-[A-Z]{1,2}\d{3,}(?:-[A-Z0-9]+)?)/i);
      if (m) { drawingNumber = m[1].toUpperCase(); break; }
    }
  }

  // ── 제목 폴백 ──
  if (!title) {
    const candidates = lines
      .filter(looksLikeTitle)
      .filter((c) => (c.match(/-/g) || []).length < 3); // 도면번호 제외
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.length - a.length);
      title = cleanTitle(candidates[0].toUpperCase());
    }
  }

  return { drawingNumber, title, rev };
}

/**
 * raw text 줄 단위 파싱 폴백
 * "1 RM-LC01-FC23350 PANEL, A5052P-H32 1 EA" 같은 패턴 감지
 */
function extractPartsFromRawText(rawText) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const parts = [];

  for (const line of lines) {
    // 숫자로 시작하고 하이픈 포함 파트번호가 이어지는 줄
    const m = line.match(
      /^(\d{1,3})\s+([A-Z0-9][A-Z0-9\-./]{3,})\s+(.+?)\s{2,}([A-Z0-9\-./]{3,})\s+(\d+\.?\d*)\s+([A-Z]{1,5})\s*(.*)$/i
    );
    if (m) {
      parts.push({
        seq: parseInt(m[1]),
        partNumber: m[2].trim().toUpperCase(),
        description: m[3].trim(),
        material: m[4].trim().toUpperCase(),
        qty: parseFloat(m[5]) || 1,
        unit: m[6].trim().toUpperCase(),
        specRemark: (m[7] || '').trim(),
      });
    }
  }

  parts.sort((a, b) => a.seq - b.seq);
  return parts;
}

/**
 * 메인 파싱 함수
 */
export function parseOCRResult(ocrData) {
  const { data } = ocrData;

  // ── 디버그 ──
  console.group('[OCR Parser Debug]');
  console.log('Raw text:\n', data.text);
  console.log('data keys:', data ? Object.keys(data).join(', ') : 'null');

  // TSV 파싱으로 단어 좌표 추출 (data.words/blocks 보다 신뢰성 높음)
  const words = extractWordsFromTSV(data.tsv);
  console.log('Word count (from TSV):', words.length);
  console.log('TSV sample (first 8 lines):', data.tsv?.split('\n').slice(0, 8));
  if (words.length > 0) console.log('Sample words:', words.slice(0, 8).map(w => w.text));

  const rows = groupWordsIntoRows(words);
  const headerIndex = findHeaderRowIndex(rows);
  console.log('Word rows:', rows.length, '| Header index:', headerIndex);
  if (headerIndex >= 0) {
    console.log('Header row text:', rowToText(rows[headerIndex]));
  }

  let parts = [];

  if (headerIndex >= 0) {
    const columns = parseHeaderColumns(rows[headerIndex]);
    console.log('Detected columns:', columns.map((c) => c.key));

    const partsAbove = extractPartsFromRange(rows, 0, headerIndex, columns);
    const partsBelow = extractPartsFromRange(rows, headerIndex + 1, rows.length, columns);
    console.log('Parts above header:', partsAbove.length, '| Parts below header:', partsBelow.length);
    parts = partsAbove.length >= partsBelow.length ? partsAbove : partsBelow;
  }

  // 좌표 기반 파싱이 실패하면 raw text 직접 파싱
  if (parts.length === 0 && data.text) {
    console.log('Coordinate parsing failed → trying raw text parsing');
    parts = extractPartsFromRawText(data.text);
    console.log('Raw text parts found:', parts.length);
  }

  const titleInfo = parseTitleBlock(data.text || '');
  console.log('Title info:', titleInfo);
  console.groupEnd();

  return {
    drawingNumber: titleInfo.drawingNumber,
    title: titleInfo.title,
    rev: titleInfo.rev,
    parts,
    rawText: data.text || '',
  };
}
