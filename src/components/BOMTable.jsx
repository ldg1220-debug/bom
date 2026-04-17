import { useState, useMemo } from 'react';
import { useBOM } from '../context/BOMContext';

// 레벨별 배경색 (spec 지정 값)
function getLevelStyle(level) {
  if (level === 1) return { backgroundColor: '#ffffff' };
  if (level === 2) return { backgroundColor: '#FFF9C4' };
  if (level === 3) return { backgroundColor: '#C8E6C9' };
  return { backgroundColor: '#ffffff' };
}

/**
 * collapsed Set(childPart 값들)에 따라 보이는 행만 필터링.
 * DFS 순서로 정렬된 bomRows를 전제로 함.
 */
function getVisibleRows(rows, collapsed) {
  const visible = [];
  const hideStack = []; // 접힌 ASSY 행의 level 스택

  for (const row of rows) {
    // 스택에서 현재 레벨보다 크거나 같은 level 항목 제거 (해당 서브트리 탈출)
    while (hideStack.length > 0 && row.level <= hideStack[hideStack.length - 1]) {
      hideStack.pop();
    }
    // 스택이 비어있지 않으면 접힌 서브트리 내부 → 숨김
    if (hideStack.length > 0) continue;

    visible.push(row);

    if (row.isAssyRow && collapsed.has(row.childPart)) {
      hideStack.push(row.level);
    }
  }
  return visible;
}

/**
 * 특정 childPart 아래의 직계 자식 수 계산 (접힌 경우 표시용)
 */
function countChildren(rows, parentChildPart) {
  let count = 0;
  let inside = false;
  let parentLevel = null;
  for (const row of rows) {
    if (row.childPart === parentChildPart && row.isAssyRow) {
      inside = true;
      parentLevel = row.level;
      continue;
    }
    if (inside) {
      if (row.level <= parentLevel) break;
      count++;
    }
  }
  return count;
}

export default function BOMTable() {
  const { state, dispatch } = useBOM();
  const { bomRows, project, circularWarnings } = state;

  const [collapsed, setCollapsed] = useState(new Set());

  function toggleCollapse(childPart) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(childPart)) next.delete(childPart);
      else next.add(childPart);
      return next;
    });
  }

  function collapseAll() {
    const assyParts = new Set(bomRows.filter((r) => r.isAssyRow).map((r) => r.childPart));
    setCollapsed(assyParts);
  }

  function expandAll() {
    setCollapsed(new Set());
  }

  function updateRow(id, field, value) {
    dispatch({ type: 'UPDATE_BOM_ROW', rowId: id, fields: { [field]: value } });
  }

  function dismissWarnings() {
    dispatch({ type: 'CLEAR_CIRCULAR_WARNINGS' });
  }

  const visibleRows = useMemo(
    () => getVisibleRows(bomRows, collapsed),
    [bomRows, collapsed]
  );

  const colDefs = [
    { label: '순번', key: 'seq', w: 40, readOnly: true },
    { label: 'LV', key: 'level', w: 32, readOnly: true },
    { label: '품목구분', key: 'itemType', w: 60 },
    { label: 'STA NO.', key: 'staNo', w: 72 },
    { label: '공정구분', key: 'processType', w: 60 },
    { label: '출도도면일자', key: 'drawingDate', w: 88 },
    { label: '모품번', key: 'parentPart', w: 140, readOnly: true },
    { label: 'REV', key: 'rev', w: 44 },
    { label: 'NO.', key: 'no', w: 36, readOnly: true },
    { label: '자품번', key: 'childPart', w: 140, readOnly: true },
    { label: '품명', key: 'description', w: 220 }, // 들여쓰기 + 토글 여기
    { label: '재질', key: 'material', w: 88 },
    { label: '규격SPEC', key: 'spec', w: 88 },
    { label: 'T', key: 'sizeT', w: 44 },
    { label: 'W', key: 'sizeW', w: 44 },
    { label: 'L', key: 'sizeL', w: 44 },
    { label: '단중(Kg)', key: 'weight', w: 64 },
    { label: '단위', key: 'unit', w: 44 },
    { label: '단위소요량', key: 'unitQty', w: 68, readOnly: true },
    { label: '배수', key: 'multiplier', w: 48, readOnly: true },
    { label: '1량', key: 'qtyPerOne', w: 60, readOnly: true },
    { label: `총수량(×${project.totalQty})`, key: 'qtyTotal', w: 80, readOnly: true },
    { label: '비고', key: 'remark', w: 140 },
  ];

  function exportCSV() {
    const headers = colDefs.map((c) => c.label).join(',');
    const csvRows = bomRows
      .map((row) =>
        colDefs
          .map((c) => {
            const val = row[c.key] ?? '';
            const str = String(val);
            return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + headers + '\n' + csvRows], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.project.name}_BOM.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (bomRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <p className="text-5xl mb-4">📊</p>
        <p className="text-lg font-medium text-gray-500">BOM이 비어있습니다</p>
        <p className="text-sm mt-1">도면 등록 탭에서 도면을 추가하면 BOM이 자동으로 생성됩니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 순환 참조 경고 */}
      {circularWarnings && circularWarnings.length > 0 && (
        <div className="mx-4 mt-2 bg-red-50 border border-red-300 rounded p-3 text-xs text-red-700 flex items-start justify-between">
          <div>
            <p className="font-bold mb-1">⚠️ 순환 참조가 감지되었습니다</p>
            {circularWarnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
          <button onClick={dismissWarnings} className="ml-3 text-red-400 hover:text-red-600 shrink-0">✕</button>
        </div>
      )}

      {/* 툴바 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-gray-700">
            BOM 테이블
            <span className="ml-2 font-normal text-gray-500">
              ({visibleRows.length} / {bomRows.length}행)
            </span>
          </h2>
          <span className="text-xs text-gray-400">총 생산량: {project.totalQty}량</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 레벨 범례 */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500 border-r border-gray-200 pr-3 mr-1">
            <span className="inline-block w-3.5 h-3.5 rounded border border-gray-300" style={{ backgroundColor: '#FFF9C4' }} />
            <span>Lv2</span>
            <span className="inline-block w-3.5 h-3.5 rounded border border-gray-300 ml-1" style={{ backgroundColor: '#C8E6C9' }} />
            <span>Lv3</span>
          </div>
          <button
            onClick={expandAll}
            className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-2 py-1 rounded"
          >
            전체 펼치기
          </button>
          <button
            onClick={collapseAll}
            className="text-xs text-gray-600 hover:text-gray-800 border border-gray-300 hover:border-gray-400 px-2 py-1 rounded"
          >
            전체 접기
          </button>
          <button
            onClick={exportCSV}
            className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded"
          >
            CSV 내보내기
          </button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ minWidth: colDefs.reduce((s, c) => s + c.w, 0) + 'px' }}>
          <thead className="sticky top-0 z-10 bg-gray-100">
            <tr>
              {colDefs.map((col) => (
                <th
                  key={col.key}
                  style={{ minWidth: col.w, width: col.w }}
                  className="px-1.5 py-2 text-xs font-semibold text-gray-600 border-b-2 border-r border-gray-300 whitespace-nowrap text-left bg-gray-100"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const rowStyle = getLevelStyle(row.level);
              const hasChildren = row.isAssyRow && bomRows.some(
                (r) => r.parentPart === row.childPart
              );
              const isCollapsed = collapsed.has(row.childPart);
              const hiddenCount = isCollapsed ? countChildren(bomRows, row.childPart) : 0;

              return (
                <tr
                  key={row.id}
                  style={rowStyle}
                  className="border-b border-gray-200 hover:brightness-95 group"
                >
                  {colDefs.map((col) => {
                    const value = row[col.key];

                    // 품명 컬럼: 들여쓰기 + 접기/펼치기 토글
                    if (col.key === 'description') {
                      const indent = (row.level - 1) * 20;
                      return (
                        <td
                          key={col.key}
                          style={{ width: col.w, minWidth: col.w }}
                          className="border-r border-gray-200 px-0 py-0"
                        >
                          <div className="flex items-center h-full">
                            {/* 들여쓰기 */}
                            <span style={{ minWidth: indent + 'px', display: 'block' }} />
                            {/* 접기/펼치기 버튼 (ASSY + 자식 있는 경우) */}
                            {hasChildren ? (
                              <button
                                onClick={() => toggleCollapse(row.childPart)}
                                className="text-gray-400 hover:text-blue-600 w-5 shrink-0 text-center text-xs leading-none"
                                title={isCollapsed ? '펼치기' : '접기'}
                              >
                                {isCollapsed ? '▶' : '▼'}
                              </button>
                            ) : (
                              <span className="w-5 shrink-0" />
                            )}
                            {/* 입력 필드 */}
                            <input
                              className={`flex-1 px-1 py-1 text-xs focus:outline-none focus:bg-blue-50 bg-transparent min-w-0 ${
                                row.isAssyRow ? 'font-semibold' : ''
                              }`}
                              value={value ?? ''}
                              onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                            />
                            {/* 접힌 경우 숨겨진 행 수 표시 */}
                            {isCollapsed && hiddenCount > 0 && (
                              <span className="text-xs text-gray-400 pr-1 shrink-0">
                                +{hiddenCount}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    }

                    // 자품번: ASSY는 굵고 파란색
                    if (col.key === 'childPart') {
                      return (
                        <td
                          key={col.key}
                          style={{ width: col.w, minWidth: col.w }}
                          className="px-1.5 py-1 text-xs border-r border-gray-200 whitespace-nowrap"
                        >
                          <span className={`font-mono ${row.isAssyRow ? 'font-bold text-blue-800' : 'text-gray-700'}`}>
                            {value}
                          </span>
                        </td>
                      );
                    }

                    // LEVEL 컬럼: 시각적 강조
                    if (col.key === 'level') {
                      return (
                        <td
                          key={col.key}
                          style={{ width: col.w, minWidth: col.w }}
                          className="px-1.5 py-1 text-xs border-r border-gray-200 text-center font-bold text-gray-600"
                        >
                          {value}
                        </td>
                      );
                    }

                    // 수량 컬럼: 숫자 포맷
                    if (col.key === 'qtyPerOne' || col.key === 'qtyTotal') {
                      return (
                        <td
                          key={col.key}
                          style={{ width: col.w, minWidth: col.w }}
                          className="px-1.5 py-1 text-xs border-r border-gray-200 text-right whitespace-nowrap"
                        >
                          {typeof value === 'number' ? value.toLocaleString() : value}
                        </td>
                      );
                    }

                    // readOnly 컬럼
                    if (col.readOnly) {
                      return (
                        <td
                          key={col.key}
                          style={{ width: col.w, minWidth: col.w }}
                          className="px-1.5 py-1 text-xs border-r border-gray-200 whitespace-nowrap text-gray-700"
                        >
                          {value ?? ''}
                        </td>
                      );
                    }

                    // 편집 가능 컬럼
                    return (
                      <td
                        key={col.key}
                        style={{ width: col.w, minWidth: col.w }}
                        className="px-0 py-0 border-r border-gray-200"
                      >
                        <input
                          className="w-full px-1.5 py-1 text-xs focus:outline-none focus:bg-blue-50 bg-transparent"
                          value={value ?? ''}
                          onChange={(e) => updateRow(row.id, col.key, e.target.value)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
