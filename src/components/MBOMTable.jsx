import { useMemo } from 'react';
import { useBOM } from '../context/BOMContext';

const COLS = [
  { key: 'no',          label: 'No',         w: 40  },
  { key: 'childPart',   label: '자품번',      w: 160 },
  { key: 'description', label: '품명',        w: 240 },
  { key: 'material',    label: '재질',        w: 100 },
  { key: 'unit',        label: '단위',        w: 48  },
  { key: 'qtyTotal',    label: '총소요량',    w: 88  },
  { key: 'parents',     label: '모품번 (출처)', w: 260 },
  { key: 'remark',      label: '비고',        w: 160 },
];

const puKey = (row) => `${row.drawingId}:${row.isAssyRow ? 'assy' : row.no}`;

export default function MBOMTable() {
  const { state } = useBOM();
  const { bomRows, purchaseUnits = new Set(), project } = state;

  // 체크된 행을 자품번 기준으로 집계 (동일 자품번 수량 합산)
  const { aggregated, checkedCount } = useMemo(() => {
    const map = new Map();
    let checkedCount = 0;

    for (const row of bomRows) {
      if (!purchaseUnits.has(puKey(row))) continue;
      checkedCount++;

      // 빈 자품번은 drawingId:no 로 구분
      const groupKey = row.childPart || `__${row.drawingId}:${row.no}`;

      if (map.has(groupKey)) {
        const ex = map.get(groupKey);
        ex.qtyTotal += row.qtyTotal;
        if (row.parentPart && !ex.parents.includes(row.parentPart)) {
          ex.parents.push(row.parentPart);
        }
      } else {
        map.set(groupKey, {
          childPart:   row.childPart,
          description: row.description,
          material:    row.material,
          unit:        row.unit,
          qtyTotal:    row.qtyTotal,
          parents:     row.parentPart ? [row.parentPart] : [],
          remark:      row.remark || '',
        });
      }
    }

    const aggregated = [...map.values()].map((item, i) => ({ ...item, no: i + 1 }));
    return { aggregated, checkedCount };
  }, [bomRows, purchaseUnits]);

  function exportCSV() {
    const headers = COLS.map((c) => c.label).join(',');
    const rows = aggregated.map((item) =>
      COLS.map((c) => {
        const v = c.key === 'parents'
          ? item.parents.join(' / ')
          : c.key === 'qtyTotal'
          ? String(item.qtyTotal ?? '')
          : String(item[c.key] ?? '');
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')
    ).join('\n');
    const blob = new Blob(['\uFEFF' + headers + '\n' + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}_MBOM.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (checkedCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
        <p className="text-5xl mb-4">🛒</p>
        <p className="text-lg font-medium text-gray-500 dark:text-gray-400">구매 목록이 비어있습니다</p>
        <p className="text-sm mt-1 text-center">
          E-BOM 탭에서 부품 행의 <strong>구매단위</strong> 체크박스를 선택하면<br />
          자품번 기준으로 수량이 합산되어 여기에 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* 헤더 */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">M-BOM — 구매 목록</h2>
          <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
            {aggregated.length}종
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            (E-BOM 체크 {checkedCount}행 → 동일 자품번 수량 합산)
          </span>
        </div>
        <button
          onClick={exportCSV}
          className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded shrink-0"
        >
          CSV 내보내기
        </button>
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-auto">
        <table
          className="border-collapse"
          style={{ minWidth: COLS.reduce((s, c) => s + c.w, 0) + 'px' }}
        >
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100 dark:bg-gray-800">
              {COLS.map((col) => (
                <th
                  key={col.key}
                  style={{ minWidth: col.w, width: col.w }}
                  className="px-2 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border-b-2 border-r border-gray-300 dark:border-gray-600 whitespace-nowrap text-left"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {aggregated.map((item, idx) => (
              <tr
                key={item.childPart || idx}
                className={`border-b border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-950 ${
                  idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'
                }`}
              >
                <td className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-center text-gray-500 dark:text-gray-400">
                  {item.no}
                </td>
                <td className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 font-mono font-semibold text-blue-700 dark:text-blue-300 whitespace-nowrap">
                  {item.childPart}
                </td>
                <td className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
                  {item.description}
                </td>
                <td className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                  {item.material}
                </td>
                <td className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-center text-gray-600 dark:text-gray-400">
                  {item.unit}
                </td>
                <td className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-right font-bold text-gray-900 dark:text-white">
                  {typeof item.qtyTotal === 'number' ? item.qtyTotal.toLocaleString() : item.qtyTotal}
                </td>
                <td className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                  {item.parents.join(' / ')}
                </td>
                <td className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                  {item.remark}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
