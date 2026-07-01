import XLSX from 'xlsx-js-style';

// ── 스타일 헬퍼 ─────────────────────────────────────────────

const BORDER_THIN = { style: 'thin', color: { rgb: 'AAAAAA' } };
const BORDER_THICK = { style: 'medium', color: { rgb: '555555' } };

function border(type = 'thin') {
  const b = type === 'thick' ? BORDER_THICK : BORDER_THIN;
  return { top: b, bottom: b, left: b, right: b };
}

function makeStyle({ bg = 'FFFFFF', bold = false, sz = 9, align = 'left', wrap = false } = {}) {
  return {
    font: { bold, sz, name: '맑은 고딕' },
    fill: { fgColor: { rgb: bg } },
    alignment: { horizontal: align, vertical: 'center', wrapText: wrap },
    border: border(),
  };
}

function hdrStyle(bg = 'BDD7EE') {
  return makeStyle({ bg, bold: true, sz: 9, align: 'center', wrap: true });
}

// BOMTable.jsx의 LV_BG_LIGHT와 동일한 레벨별 색상표 (L1은 흰색)
const LV_BG = ['', 'FFF9C4', 'C8E6C9', 'DBEAFE', 'EDE9FE', 'FCE7F3', 'FED7AA', 'CFFAFE'];

function levelBg(level) {
  return LV_BG[level - 1] || 'FFFFFF';
}

function cv(value, style) {
  return { v: value ?? '', t: 's', s: style };
}

function nv(value, style) {
  if (value === '' || value == null) return { v: '', t: 's', s: style };
  return { v: Number(value) || 0, t: 'n', s: { ...style, alignment: { ...style.alignment, horizontal: 'right' } } };
}

function datestamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// ── 컬럼 레이아웃 ────────────────────────────────────────────

/*
 인덱스  컬럼
 0       순번
 1-7     L1~L7  (LEVEL 하위)
 8       품목구분
 9       STA NO.
 10      공정구분
 11      출도도면일자
 12      모품번
 13      REV
 14      NO.
 15      자품번
 16      품명
 17      재질
 18      규격SPEC
 19      T      (SIZE 하위)
 20      W
 21      L
 22      단중(Kg)
 23      단위
 24      단위소요량  (소요량 하위)
 25      배수
 26      1량
 27      N량 (총수량)
 28      비고
*/
const TOTAL_COLS = 29;

const COL_WIDTHS = [
  5,          // 순번
  3,3,3,3,3,3,3,  // L1-L7
  8,          // 품목구분
  9,          // STA NO.
  8,          // 공정구분
  12,         // 출도도면일자
  20,         // 모품번
  5,          // REV
  5,          // NO.
  22,         // 자품번
  28,         // 품명
  12,         // 재질
  12,         // 규격SPEC
  5,5,5,      // T,W,L
  8,          // 단중
  6,          // 단위
  10,         // 단위소요량
  7,          // 배수
  8,          // 1량
  10,         // N량
  20,         // 비고
];

// ── 메인 내보내기 함수 ───────────────────────────────────────

export function exportToExcel(state) {
  const { project, bomRows } = state;
  const totalQty = project.totalQty || 1;
  const today = datestamp();

  const titleStyle = {
    font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' }, name: '맑은 고딕' },
    fill: { fgColor: { rgb: '1F4E79' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border('thick'),
  };
  const infoStyle = makeStyle({ bg: 'DEEAF1', bold: false, sz: 10 });

  // ── 행1: 프로젝트명 ──
  const row1 = [cv(project.name, titleStyle)];
  for (let i = 1; i < TOTAL_COLS; i++) row1.push(cv('', titleStyle));

  // ── 행2: 기준일 / 총량수 ──
  const infoText = `기준일: ${project.baseDate || '-'}    총 생산수량: ${totalQty}량    도면 수: ${state.drawings?.length || 0}`;
  const row2 = [cv(infoText, infoStyle)];
  for (let i = 1; i < TOTAL_COLS; i++) row2.push(cv('', infoStyle));

  // ── 행3: 컬럼 헤더 1단 ──
  const H1 = hdrStyle();
  const H1b = hdrStyle('9DC3E6'); // 강조 헤더
  const row3 = [
    cv('순번', H1b),
    cv('LEVEL', H1b), cv('', H1b), cv('', H1b), cv('', H1b), cv('', H1b), cv('', H1b), cv('', H1b), // L1-L7 (merged)
    cv('품목구분', H1), cv('STA NO.', H1), cv('공정구분', H1), cv('출도도면일자', H1),
    cv('모품번', H1b), cv('REV', H1), cv('NO.', H1), cv('자품번', H1b),
    cv('품명', H1b), cv('재질', H1), cv('규격SPEC', H1),
    cv('SIZE', H1b), cv('', H1b), cv('', H1b), // T,W,L (merged)
    cv('단중(Kg)', H1),
    cv('단위', H1),
    cv('소요량', H1b), cv('', H1b), cv('', H1b), // 단위소요량, 배수, 1량 (merged)
    cv(`총수량(×${totalQty})`, H1b),
    cv('비고', H1),
  ];

  // ── 행4: 컬럼 헤더 2단 ──
  const H2 = hdrStyle('D9E1F2');
  const row4 = [
    cv('', H2),
    cv('1', H2), cv('2', H2), cv('3', H2), cv('4', H2), cv('5', H2), cv('6', H2), cv('7', H2),
    cv('', H2), cv('', H2), cv('', H2), cv('', H2),
    cv('', H2), cv('', H2), cv('', H2), cv('', H2),
    cv('', H2), cv('', H2), cv('', H2),
    cv('T', H2), cv('W', H2), cv('L', H2),
    cv('', H2),
    cv('', H2),
    cv('단위소요량', H2), cv('배수', H2), cv('1량', H2),
    cv(`${totalQty}량`, H2),
    cv('', H2),
  ];

  // ── 데이터 행 ──
  const dataRows = bomRows.map((row) => {
    const bg = levelBg(row.level);
    const ds = makeStyle({ bg });
    const dc = makeStyle({ bg, align: 'center' });
    const dr = makeStyle({ bg, align: 'right' });

    // LEVEL 표시: 해당 레벨 컬럼(인덱스 1~7)에만 level 숫자, 나머지 빈칸
    const lvCells = [];
    for (let l = 1; l <= 7; l++) {
      lvCells.push(row.level === l ? cv(String(l), { ...dc, font: { ...dc.font, bold: true } }) : cv('', dc));
    }

    return [
      cv(String(row.seq ?? ''), dc),
      ...lvCells,
      cv(row.itemType || '', ds),
      cv(row.staNo || '', ds),
      cv(row.processType || '', ds),
      cv(row.drawingDate || '', ds),
      cv(row.parentPart || '', ds),
      cv(row.rev || '', dc),
      nv(row.displayNo === null ? '' : (row.displayNo ?? row.no ?? ''), dc),
      cv(row.childPart || '', { ...ds, font: { ...ds.font, bold: row.isAssyRow } }),
      cv(row.description || '', ds),
      cv(row.material || '', ds),
      cv(row.spec || '', ds),
      cv(row.sizeT || '', dc),
      cv(row.sizeW || '', dc),
      cv(row.sizeL || '', dc),
      cv(row.weight || '', dr),
      cv(row.unit || '', dc),
      nv(row.unitQty ?? '', dr),
      nv(row.multiplier ?? '', dr),
      nv(row.qtyPerOne ?? '', dr),
      nv(row.qtyTotal ?? '', { ...dr, font: { ...dr.font, bold: true } }),
      cv(row.remark || '', ds),
    ];
  });

  const wsData = [row1, row2, row3, row4, ...dataRows];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // ── 셀 병합 ──
  const lastDataRow = 3 + dataRows.length; // 0-indexed, row 4+
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: TOTAL_COLS - 1 } },  // 행1: 프로젝트명
    { s: { r: 1, c: 0 }, e: { r: 1, c: TOTAL_COLS - 1 } },  // 행2: 기준일
    { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },               // 순번 (2행 병합)
    { s: { r: 2, c: 1 }, e: { r: 2, c: 7 } },               // LEVEL
    { s: { r: 2, c: 8 }, e: { r: 3, c: 8 } },               // 품목구분
    { s: { r: 2, c: 9 }, e: { r: 3, c: 9 } },               // STA NO.
    { s: { r: 2, c: 10 }, e: { r: 3, c: 10 } },             // 공정구분
    { s: { r: 2, c: 11 }, e: { r: 3, c: 11 } },             // 출도도면일자
    { s: { r: 2, c: 12 }, e: { r: 3, c: 12 } },             // 모품번
    { s: { r: 2, c: 13 }, e: { r: 3, c: 13 } },             // REV
    { s: { r: 2, c: 14 }, e: { r: 3, c: 14 } },             // NO.
    { s: { r: 2, c: 15 }, e: { r: 3, c: 15 } },             // 자품번
    { s: { r: 2, c: 16 }, e: { r: 3, c: 16 } },             // 품명
    { s: { r: 2, c: 17 }, e: { r: 3, c: 17 } },             // 재질
    { s: { r: 2, c: 18 }, e: { r: 3, c: 18 } },             // 규격SPEC
    { s: { r: 2, c: 19 }, e: { r: 2, c: 21 } },             // SIZE
    { s: { r: 2, c: 22 }, e: { r: 3, c: 22 } },             // 단중
    { s: { r: 2, c: 23 }, e: { r: 3, c: 23 } },             // 단위
    { s: { r: 2, c: 24 }, e: { r: 2, c: 26 } },             // 소요량
    { s: { r: 2, c: 27 }, e: { r: 3, c: 27 } },             // 총수량
    { s: { r: 2, c: 28 }, e: { r: 3, c: 28 } },             // 비고
  ];

  // ── 행 높이 ──
  ws['!rows'] = [
    { hpt: 24 }, // 행1
    { hpt: 18 }, // 행2
    { hpt: 30 }, // 행3
    { hpt: 24 }, // 행4
    ...dataRows.map(() => ({ hpt: 16 })),
  ];

  // ── 컬럼 너비 ──
  ws['!cols'] = COL_WIDTHS.map((wch) => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BOM');

  // 메타 시트
  const metaWs = XLSX.utils.aoa_to_sheet([
    [{ v: '프로젝트명', s: hdrStyle() }, { v: project.name, s: makeStyle() }],
    [{ v: '기준일', s: hdrStyle() }, { v: project.baseDate || '', s: makeStyle() }],
    [{ v: '총 생산수량', s: hdrStyle() }, { v: totalQty, s: makeStyle() }],
    [{ v: '도면 수', s: hdrStyle() }, { v: state.drawings?.length || 0, s: makeStyle() }],
    [{ v: '내보내기 일시', s: hdrStyle() }, { v: new Date().toLocaleString('ko-KR'), s: makeStyle() }],
  ]);
  metaWs['!cols'] = [{ wch: 14 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, metaWs, '프로젝트 정보');

  XLSX.writeFile(wb, `BOM_${project.name}_${today}.xlsx`);
}

// ── M-BOM 내보내기 ───────────────────────────────────────────────

const MBOM_COLS = [
  { key: 'no',          label: 'No',           w: 5  },
  { key: 'staNo',       label: 'Station',      w: 14 },
  { key: 'processType', label: '공정명',        w: 12 },
  { key: 'childPart',   label: '자품번',        w: 22 },
  { key: 'description', label: '품명',          w: 28 },
  { key: 'spec',        label: '규격',          w: 14 },
  { key: 'material',    label: '재질',          w: 12 },
  { key: 'vendor',      label: '제작업체',      w: 14 },
  { key: 'unit',        label: '단위',          w: 6  },
  { key: 'qtyTotal',    label: '총소요량',      w: 12 },
  { key: 'parents',     label: '모품번 (출처)', w: 28 },
  { key: 'remark',      label: '비고',          w: 20 },
];

function puKey(row) {
  return `${row.drawingId}:${row.isAssyRow ? 'assy' : row.no}`;
}

export function exportMBOMToExcel(state) {
  const { project, bomRows, purchaseUnits = new Set(), mbomOverrides = {} } = state;
  const today = datestamp();

  // 집계 (MBOMTable과 동일 로직)
  const map = new Map();
  for (const row of bomRows) {
    if (!purchaseUnits.has(puKey(row))) continue;
    const groupKey = row.childPart || `__${row.drawingId}:${row.no}`;
    if (map.has(groupKey)) {
      const ex = map.get(groupKey);
      ex.qtyTotal += row.qtyTotal;
      if (row.parentPart && !ex.parents.includes(row.parentPart)) ex.parents.push(row.parentPart);
      if (row.staNo && !ex.staNoSet.has(row.staNo)) ex.staNoSet.add(row.staNo);
      if (row.processType && !ex.processTypeSet.has(row.processType)) ex.processTypeSet.add(row.processType);
      if (!ex.spec && row.spec) ex.spec = row.spec;
      if (!ex.material && row.material) ex.material = row.material;
      if (!ex.vendor && row.vendor) ex.vendor = row.vendor;
    } else {
      map.set(groupKey, {
        childPart: row.childPart,
        description: row.description,
        spec: row.spec || '',
        material: row.material || '',
        vendor: row.vendor || '',
        unit: row.unit,
        qtyTotal: row.qtyTotal,
        parents: row.parentPart ? [row.parentPart] : [],
        remark: row.remark || '',
        staNoSet: new Set(row.staNo ? [row.staNo] : []),
        processTypeSet: new Set(row.processType ? [row.processType] : []),
      });
    }
  }

  const aggregated = [...map.values()].map((item, i) => {
    const { staNoSet, processTypeSet, ...rest } = item;
    const base = {
      ...rest,
      no: i + 1,
      staNo: [...staNoSet].join(' / '),
      processType: [...processTypeSet].join(' / '),
    };
    const overrides = mbomOverrides[base.childPart] || {};
    return { ...base, ...overrides };
  });

  if (aggregated.length === 0) {
    alert('M-BOM에 집계된 항목이 없습니다.\nE-BOM 탭에서 구매단위 체크박스를 선택해주세요.');
    return;
  }

  const titleStyle = {
    font: { bold: true, sz: 13, color: { rgb: 'FFFFFF' }, name: '맑은 고딕' },
    fill: { fgColor: { rgb: '1F4E79' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: border('thick'),
  };
  const infoStyle = makeStyle({ bg: 'DEEAF1', sz: 10 });
  const H = hdrStyle();

  const NCOLS = MBOM_COLS.length;
  const row1 = [cv(`${project.name} — M-BOM (구매 목록)`, titleStyle)];
  for (let i = 1; i < NCOLS; i++) row1.push(cv('', titleStyle));

  const row2 = [cv(`기준일: ${project.baseDate || '-'}    총 생산수량: ${project.totalQty || 1}량    집계 종류: ${aggregated.length}종`, infoStyle)];
  for (let i = 1; i < NCOLS; i++) row2.push(cv('', infoStyle));

  const headerRow = MBOM_COLS.map((c) => cv(c.label, H));

  const dataRows = aggregated.map((item, idx) => {
    const bg = idx % 2 === 0 ? 'FFFFFF' : 'F5F5F5';
    const ds = makeStyle({ bg });
    const dc = makeStyle({ bg, align: 'center' });
    const dr = makeStyle({ bg, align: 'right' });

    return MBOM_COLS.map((col) => {
      const val = col.key === 'parents'
        ? item.parents.join(' / ')
        : item[col.key];
      if (col.key === 'no') return cv(String(val ?? ''), dc);
      if (col.key === 'qtyTotal') return nv(val, dr);
      return cv(String(val ?? ''), ds);
    });
  });

  const wsData = [row1, row2, headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } },
  ];
  ws['!rows'] = [{ hpt: 22 }, { hpt: 16 }, { hpt: 24 }, ...dataRows.map(() => ({ hpt: 15 }))];
  ws['!cols'] = MBOM_COLS.map((c) => ({ wch: c.w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'M-BOM');
  XLSX.writeFile(wb, `MBOM_${project.name}_${today}.xlsx`);
}
