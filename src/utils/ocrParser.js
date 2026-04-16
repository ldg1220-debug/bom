/**
 * Tesseract.js recognize() 결과에서 파트리스트와 도면 정보를 구조화 파싱
 */

const HEADER_KEYWORDS = ['no', 'part', 'description', 'material', 'qty', 'unit', 'spec', 'remark'];
const TITLE_KEYWORDS = ['dwg', 'drawing', 'rev', 'title', 'sheet'];

/**
 * OCR 단어 배열을 Y좌표 기준으로 행 그룹핑
 */
function groupWordsIntoRows(words, yTolerance = 12) {
  if (!words || words.length === 0) return [];

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
  if (currentRow.length > 0) {
    rows.push(currentRow.sort((a, b) => a.bbox.x0 - b.bbox.x0));
  }

  return rows;
}

/**
 * 행 배열을 텍스트 문자열로 변환
 */
function rowToText(row) {
  return row.map((w) => w.text).join(' ').toLowerCase();
}

/**
 * 헤더 행 인덱스 찾기
 */
function findHeaderRowIndex(rows) {
  for (let i = 0; i < rows.length; i++) {
    const text = rowToText(rows[i]);
    const matchCount = HEADER_KEYWORDS.filter((kw) => text.includes(kw)).length;
    if (matchCount >= 3) return i;
  }
  return -1;
}

/**
 * 헤더 행에서 각 컬럼의 X 범위를 파악
 */
function parseHeaderColumns(headerRow) {
  const text = rowToText([...headerRow]);
  const columns = [];

  const colKeywords = [
    { key: 'no', aliases: ['no.', 'no', '순번', '번호'] },
    { key: 'partNumber', aliases: ['part no', 'part', '부품번호'] },
    { key: 'description', aliases: ['description', 'desc', '품명', '부품명'] },
    { key: 'material', aliases: ['material', 'matl', '재질', '재료'] },
    { key: 'qty', aliases: ['qty', 'quantity', '수량'] },
    { key: 'unit', aliases: ['unit', '단위'] },
    { key: 'specRemark', aliases: ['spec', 'remark', 'remarks', '비고'] },
  ];

  for (const col of colKeywords) {
    for (const alias of col.aliases) {
      const matchingWord = headerRow.find((w) =>
        w.text.toLowerCase().includes(alias)
      );
      if (matchingWord) {
        columns.push({
          key: col.key,
          x0: matchingWord.bbox.x0,
          x1: matchingWord.bbox.x1,
        });
        break;
      }
    }
  }

  columns.sort((a, b) => a.x0 - b.x0);
  return columns;
}

/**
 * X좌표를 기준으로 단어를 가장 가까운 컬럼에 매핑
 */
function assignWordToColumn(word, columns) {
  if (columns.length === 0) return null;

  let best = null;
  let bestDist = Infinity;

  for (const col of columns) {
    const colCenter = (col.x0 + col.x1) / 2;
    const wordCenter = (word.bbox.x0 + word.bbox.x1) / 2;
    const dist = Math.abs(wordCenter - colCenter);
    if (dist < bestDist) {
      bestDist = dist;
      best = col.key;
    }
  }
  return best;
}

/**
 * 단일 데이터 행을 파트 객체로 파싱
 */
function parseDataRow(row, columns, rowIndex) {
  const part = {
    seq: rowIndex,
    partNumber: '',
    description: '',
    material: '',
    qty: 1,
    unit: 'EA',
    specRemark: '',
  };

  if (columns.length === 0) {
    // 헤더 없이 순서대로 파싱 시도
    const texts = row.map((w) => w.text);
    if (texts.length >= 1) part.seq = parseInt(texts[0]) || rowIndex;
    if (texts.length >= 2) part.partNumber = texts[1];
    if (texts.length >= 3) part.description = texts.slice(2, texts.length - 3).join(' ');
    if (texts.length >= 4) part.material = texts[texts.length - 3] || '';
    if (texts.length >= 2) part.qty = parseFloat(texts[texts.length - 2]) || 1;
    part.unit = 'EA';
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

  return part;
}

/**
 * 타이틀 블록(도면 하단)에서 도면번호, 제목, REV 추출
 * Tesseract의 전체 텍스트(data.text)를 줄 단위로 파싱
 */
function parseTitleBlock(fullText) {
  const lines = fullText.split('\n').map((l) => l.trim()).filter(Boolean);
  let drawingNumber = '';
  let title = '';
  let rev = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toUpperCase();

    // DWG NO or DRAWING NO 패턴
    if (line.includes('DWG') && line.includes('NO')) {
      const parts = lines[i].split(/[:=\s]+/);
      const idx = parts.findIndex((p) => /no/i.test(p));
      if (idx >= 0 && parts[idx + 1]) {
        drawingNumber = parts.slice(idx + 1).join('').trim();
      } else if (i + 1 < lines.length) {
        drawingNumber = lines[i + 1].trim();
      }
    }

    // RM- 또는 LC- 로 시작하는 도면 번호 패턴 직접 감지
    const dwgMatch = lines[i].match(/\b(RM-[A-Z0-9-]+|LC\d+-[A-Z0-9-]+|[A-Z]{2,}-[A-Z0-9]+-[A-Z0-9]+)\b/);
    if (dwgMatch && !drawingNumber) {
      drawingNumber = dwgMatch[1];
    }

    // REV 패턴
    const revMatch = lines[i].match(/\bREV\s*[:\s]\s*([A-Z0-9]+)/i);
    if (revMatch) {
      rev = revMatch[1];
    }
    // 단독 REV 라인 다음 값
    if (line === 'REV' && i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (/^[A-Z0-9]{1,3}$/.test(next)) rev = next;
    }

    // TITLE 패턴
    if (line.includes('TITLE') && i + 1 < lines.length) {
      title = lines[i + 1].trim();
    }
  }

  // title이 비어있으면 첫 번째 비교적 긴 대문자 라인을 제목으로
  if (!title) {
    const candidate = lines.find(
      (l) => l.length > 5 && /^[A-Z\s,_.-]+$/.test(l) && !TITLE_KEYWORDS.some((kw) => l.toLowerCase().includes(kw))
    );
    if (candidate) title = candidate;
  }

  return { drawingNumber, title, rev };
}

/**
 * 메인 파싱 함수: Tesseract recognize() 결과를 받아 구조화된 데이터 반환
 */
export function parseOCRResult(ocrData) {
  const { data } = ocrData;

  // 모든 word 추출 (신뢰도 30 이상)
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
    let partSeq = 1;

    for (let i = headerIndex + 1; i < rows.length; i++) {
      const rowText = rowToText(rows[i]);
      // 빈 행 또는 서명/날짜 행 스킵
      if (!rowText.trim()) continue;
      if (/approved|checked|drawn|date|scale|sheet/i.test(rowText)) continue;

      const part = parseDataRow(rows[i], columns, partSeq);
      // 최소한 partNumber나 description이 있어야 유효한 파트
      if (part.partNumber || part.description) {
        if (!part.seq || part.seq === partSeq) part.seq = partSeq;
        parts.push(part);
        partSeq++;
      }
    }
  }

  // 타이틀 블록 파싱
  const titleInfo = parseTitleBlock(data.text || '');

  return {
    drawingNumber: titleInfo.drawingNumber,
    title: titleInfo.title,
    rev: titleInfo.rev,
    parts,
    rawText: data.text || '',
  };
}
