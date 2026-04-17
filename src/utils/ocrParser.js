/**
 * Tesseract.js recognize() 결과에서 파트리스트와 도면 정보를 구조화 파싱
 */

const HEADER_KEYWORDS = ['no', 'part', 'description', 'material', 'qty', 'unit', 'spec', 'remark'];

function groupWordsIntoRows(words, yTolerance = 12) {
  if (!words || words.length === 0) return [];
  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const rows = [];
  let currentRow = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const word = sorted[i];
    if (Math.abs(word.bbox.y0 - currentRow[0].bbox.y0) <= yTolerance) {
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
  for (let i = 0; i < rows.length; i++) {
    const text = rowToText(rows[i]);
    const matchCount = HEADER_KEYWORDS.filter((kw) => text.includes(kw)).length;
    if (matchCount >= 3) return i;
  }
  return -1;
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
  const part = {
    seq: 0,
    partNumber: '',
    description: '',
    material: '',
    qty: 1,
    unit: 'EA',
    specRemark: '',
  };

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

// ── 타이틀 블록 파싱 헬퍼 ──────────────────────────────────────

function hasKorean(s) {
  return /[\u3130-\u318F\uAC00-\uD7AF]/.test(s);
}

/** 조립체 명칭처럼 보이는지 (ALL CAPS, 날짜/한글 없음) */
function looksLikeTitle(s) {
  if (!s || s.length < 4 || s.length > 70) return false;
  if (/\d{4,}/.test(s)) return false;    // 연도/긴 숫자 포함 시 제외
  if (hasKorean(s)) return false;
  if (/[=@#$%^&*(){}\[\]|<>]/.test(s)) return false;
  return /^[A-Z][A-Z0-9\s,._\-/]+$/i.test(s);
}

/**
 * 타이틀 블록(도면 하단)에서 도면번호, 제목, REV 추출
 */
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
      // 같은 줄에서 "NO" 이후 내용 추출
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
      // 같은 줄에서 "TITLE" 이후 내용 먼저 확인
      const afterTitle = line.replace(/.*?title\s*/i, '').trim();
      if (looksLikeTitle(afterTitle)) {
        title = afterTitle.toUpperCase();
        // 다음 줄이 제목 연속인지 확인
        if (i + 1 < lines.length && looksLikeTitle(lines[i + 1])) {
          title += ' ' + lines[i + 1].trim().toUpperCase();
        }
      } else {
        // 다음 몇 줄에서 제목처럼 보이는 줄 탐색
        for (let j = i + 1; j <= Math.min(i + 5, lines.length - 1); j++) {
          if (looksLikeTitle(lines[j])) {
            title = lines[j].trim().toUpperCase();
            if (j + 1 < lines.length && looksLikeTitle(lines[j + 1])) {
              title += ' ' + lines[j + 1].trim().toUpperCase();
            }
            break;
          }
        }
      }
    }
  }

  // ── 도면번호 폴백: 하이픈 포함 영숫자 패턴 (대소문자 무관) ──
  if (!drawingNumber) {
    for (const line of lines) {
      const m = line.match(/\b([A-Z]{2,4}-[A-Z0-9]{2,6}-[A-Z]{1,2}\d{3,}(?:-[A-Z0-9]+)?)\b/i);
      if (m) { drawingNumber = m[1].toUpperCase(); break; }
    }
  }

  // ── 제목 폴백: 가장 긴 all-caps 영문 라인 ──
  if (!title) {
    const candidates = lines
      .filter(looksLikeTitle)
      // 도면번호처럼 보이는 것은 제외 (하이픈 3개 이상)
      .filter((c) => (c.match(/-/g) || []).length < 3);
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.length - a.length);
      title = candidates[0].toUpperCase();
    }
  }

  return { drawingNumber, title, rev };
}

/**
 * 메인 파싱 함수: Tesseract recognize() 결과를 받아 구조화된 데이터 반환
 */
export function parseOCRResult(ocrData) {
  const { data } = ocrData;

  const words = [];
  if (data.words) {
    for (const word of data.words) {
      if (word.confidence > 30 && word.text.trim()) {
        words.push({ text: word.text.trim(), bbox: word.bbox });
      }
    }
  }

  const rows = groupWordsIntoRows(words);
  const headerIndex = findHeaderRowIndex(rows);

  let columns = [];
  let parts = [];

  if (headerIndex >= 0) {
    columns = parseHeaderColumns(rows[headerIndex]);

    // 한국 도면: 헤더가 파트리스트 아래에 위치 → 헤더 위쪽을 파싱
    // 표준 도면: 헤더가 위, 데이터가 아래 → 헤더 아래쪽을 파싱
    const rowsAbove = headerIndex;
    const rowsBelow = rows.length - headerIndex - 1;
    const partsAreAbove = rowsAbove > rowsBelow;

    const startIdx = partsAreAbove ? 0 : headerIndex + 1;
    const endIdx   = partsAreAbove ? headerIndex : rows.length;

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

    // seq 번호 오름차순 정렬
    parts.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  }

  const titleInfo = parseTitleBlock(data.text || '');

  return {
    drawingNumber: titleInfo.drawingNumber,
    title: titleInfo.title,
    rev: titleInfo.rev,
    parts,
    rawText: data.text || '',
  };
}
