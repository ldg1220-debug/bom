import { useBOM } from '../context/BOMContext';

const LEVEL_COLORS = {
  1: 'bg-white',
  2: 'bg-yellow-100',
  3: 'bg-green-100',
};

function getLevelBg(level) {
  return LEVEL_COLORS[level] || 'bg-white';
}

function LevelIndent({ level }) {
  return (
    <span
      className="inline-block shrink-0"
      style={{ width: `${(level - 1) * 16}px` }}
    />
  );
}

export default function BOMTable() {
  const { state, dispatch } = useBOM();
  const { bomRows, project } = state;

  function updateRow(id, field, value) {
    dispatch({ type: 'UPDATE_BOM_ROW', rowId: id, fields: { [field]: value } });
  }

  function Cell({ value, rowId, field, className = '', type = 'text', readOnly = false }) {
    if (readOnly) {
      return (
        <td className={`px-1.5 py-1 text-xs border-r border-gray-200 whitespace-nowrap ${className}`}>
          {value ?? ''}
        </td>
      );
    }
    return (
      <td className={`px-0 py-0 border-r border-gray-200 ${className}`}>
        <input
          className="w-full h-full px-1.5 py-1 text-xs focus:outline-none focus:bg-blue-50 bg-transparent"
          type={type}
          value={value ?? ''}
          onChange={(e) => updateRow(rowId, field, e.target.value)}
        />
      </td>
    );
  }

  const colDefs = [
    { label: '순번', key: 'seq', w: 'w-10', readOnly: true },
    { label: 'LEVEL', key: 'level', w: 'w-12', readOnly: true },
    { label: '품목구분', key: 'itemType', w: 'w-16' },
    { label: 'STA NO.', key: 'staNo', w: 'w-20' },
    { label: '공정구분', key: 'processType', w: 'w-16' },
    { label: '출도도면일자', key: 'drawingDate', w: 'w-24' },
    { label: '모품번', key: 'parentPart', w: 'w-36', readOnly: true },
    { label: 'REV', key: 'rev', w: 'w-12' },
    { label: 'NO.', key: 'no', w: 'w-10', readOnly: true },
    { label: '자품번', key: 'childPart', w: 'w-36', readOnly: true },
    { label: '품명', key: 'description', w: 'w-48' },
    { label: '재질', key: 'material', w: 'w-24' },
    { label: '규격SPEC', key: 'spec', w: 'w-24' },
    { label: 'T', key: 'sizeT', w: 'w-12' },
    { label: 'W', key: 'sizeW', w: 'w-12' },
    { label: 'L', key: 'sizeL', w: 'w-12' },
    { label: '단중(Kg)', key: 'weight', w: 'w-16' },
    { label: '단위', key: 'unit', w: 'w-12' },
    { label: '단위소요량', key: 'unitQty', w: 'w-16', readOnly: true },
    { label: '배수', key: 'multiplier', w: 'w-12', readOnly: true },
    { label: `1량(${project.totalQty}량 기준)`, key: 'qtyPerOne', w: 'w-20', readOnly: true },
    { label: `총수량(×${project.totalQty})`, key: 'qtyTotal', w: 'w-20', readOnly: true },
    { label: '비고', key: 'remark', w: 'w-36' },
  ];

  function exportCSV() {
    const headers = colDefs.map((c) => c.label).join(',');
    const rows = bomRows
      .map((row) =>
        colDefs
          .map((c) => {
            const val = row[c.key] ?? '';
            const str = String(val);
            return str.includes(',') ? `"${str}"` : str;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + headers + '\n' + rows], {
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
        <p className="text-4xl mb-3">📊</p>
        <p className="text-lg font-medium">BOM이 비어있습니다</p>
        <p className="text-sm mt-1">도면 등록 탭에서 도면을 등록하면 자동으로 BOM이 생성됩니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 툴바 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-gray-700">
            BOM 테이블 ({bomRows.length}행)
          </h2>
          <span className="text-xs text-gray-500">총 생산량: {project.totalQty}량</span>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block w-4 h-4 bg-yellow-100 border border-yellow-300 rounded" /> Level 2
            <span className="inline-block w-4 h-4 bg-green-100 border border-green-300 rounded ml-2" /> Level 3
          </div>
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
        <table className="min-w-max border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-100">
            <tr>
              {colDefs.map((col) => (
                <th
                  key={col.key}
                  className={`${col.w} px-1.5 py-2 text-xs font-semibold text-gray-600 border-b-2 border-r border-gray-300 whitespace-nowrap text-left sticky top-0 bg-gray-100`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bomRows.map((row) => {
              const bg = getLevelBg(row.level);
              return (
                <tr
                  key={row.id}
                  className={`border-b border-gray-200 ${bg} hover:brightness-95`}
                >
                  {colDefs.map((col) => {
                    const isChildPart = col.key === 'childPart';
                    const value = row[col.key];
                    const displayValue = col.key === 'qtyPerOne' || col.key === 'qtyTotal'
                      ? (typeof value === 'number' ? value.toLocaleString() : value)
                      : value;

                    if (col.readOnly) {
                      return (
                        <td
                          key={col.key}
                          className={`${col.w} px-1.5 py-1 text-xs border-r border-gray-200 whitespace-nowrap`}
                        >
                          {isChildPart ? (
                            <div className="flex items-center">
                              <LevelIndent level={row.level} />
                              <span className={`font-mono ${row.isAssyRow ? 'font-bold text-blue-800' : ''}`}>
                                {displayValue}
                              </span>
                            </div>
                          ) : (
                            <span className={col.key === 'level' ? 'font-semibold text-gray-700' : ''}>
                              {displayValue}
                            </span>
                          )}
                        </td>
                      );
                    }

                    return (
                      <td key={col.key} className={`${col.w} px-0 py-0 border-r border-gray-200`}>
                        <input
                          className="w-full h-full px-1.5 py-1 text-xs focus:outline-none focus:bg-blue-50 bg-transparent"
                          type="text"
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
