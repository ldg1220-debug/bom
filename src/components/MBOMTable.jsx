import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useBOM } from '../context/BOMContext';

// ── 열 정의 ───────────────────────────────────────────────────
const ALL_MBOM_COLS = [
  { key: 'no',          label: 'No',            w: 40  },
  { key: 'staNo',       label: 'Station',       w: 80  },
  { key: 'processType', label: '공정명',        w: 80  },
  { key: 'childPart',   label: '자품번',        w: 160 },
  { key: 'description', label: '품명',          w: 240 },
  { key: 'spec',        label: '규격',          w: 100 },
  { key: 'material',    label: '재질',          w: 100 },
  { key: 'vendor',      label: '제작업체',      w: 100 },
  { key: 'unit',        label: '단위',          w: 48  },
  { key: 'qtyTotal',    label: '총소요량',      w: 88  },
  { key: 'parents',     label: '모품번 (출처)', w: 260 },
  { key: 'remark',      label: '비고',          w: 160 },
];

const MBOM_FIXED_KEYS = new Set(['no', 'childPart', 'description', 'unit', 'qtyTotal', 'parents']);
const MBOM_ALL_OPTIONAL_KEYS = ['staNo', 'processType', 'spec', 'material', 'vendor', 'remark'];

// ── ColumnManager ─────────────────────────────────────────────
function ColumnManager({ visible, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const optional = ALL_MBOM_COLS.filter((c) => !MBOM_FIXED_KEYS.has(c.key));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`text-xs border px-2 py-1 rounded ${
          open
            ? 'bg-blue-600 text-white border-blue-600'
            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
      >⚙ 열</button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 min-w-[200px] p-2">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-1 mb-2">
            옵션 열 표시
          </p>
          <div className="space-y-0.5">
            {optional.map((col) => (
              <label
                key={col.key}
                className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={visible.has(col.key)}
                  onChange={() => onToggle(col.key)}
                  className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const puKey = (row) => `${row.drawingId}:${row.isAssyRow ? 'assy' : row.no}`;

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export default function MBOMTable() {
  const { state } = useBOM();
  const { bomRows, purchaseUnits = new Set(), project } = state;

  const [colVisible, setColVisible] = useState(() => {
    try {
      const saved = localStorage.getItem('bom:col:mbom');
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set(MBOM_ALL_OPTIONAL_KEYS);
  });

  const toggleColVisible = useCallback((key) => {
    setColVisible((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      try { localStorage.setItem('bom:col:mbom', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const visibleCols = useMemo(
    () => ALL_MBOM_COLS.filter((col) => MBOM_FIXED_KEYS.has(col.key) || colVisible.has(col.key)),
    [colVisible]
  );

  // 체크된 행을 자품번 기준으로 집계
  const { aggregated, checkedCount } = useMemo(() => {
    const map = new Map();
    let checkedCount = 0;

    for (const row of bomRows) {
      if (!purchaseUnits.has(puKey(row))) continue;
      checkedCount++;

      const groupKey = row.childPart || `__${row.drawingId}:${row.no}`;

      if (map.has(groupKey)) {
        const ex = map.get(groupKey);
        ex.qtyTotal += row.qtyTotal;
        if (row.parentPart && !ex.parents.includes(row.parentPart)) {
          ex.parents.push(row.parentPart);
        }
        // staNo/processType: 모든 값을 Set으로 수집 (중복 제거)
        if (row.staNo) ex._staNoSet.add(row.staNo);
        if (row.processType) ex._processTypeSet.add(row.processType);
      } else {
        map.set(groupKey, {
          childPart:       row.childPart,
          description:     row.description,
          spec:            row.spec || '',
          material:        row.material || '',
          vendor:          row.vendor || '',
          unit:            row.unit,
          qtyTotal:        row.qtyTotal,
          parents:         row.parentPart ? [row.parentPart] : [],
          remark:          row.remark || '',
          _staNoSet:       new Set(row.staNo ? [row.staNo] : []),
          _processTypeSet: new Set(row.processType ? [row.processType] : []),
        });
      }
    }

    const aggregated = [...map.values()].map((item, i) => ({
      no:          i + 1,
      childPart:   item.childPart,
      description: item.description,
      spec:        item.spec,
      material:    item.material,
      vendor:      item.vendor,
      unit:        item.unit,
      qtyTotal:    item.qtyTotal,
      parents:     item.parents,
      remark:      item.remark,
      staNo:       [...item._staNoSet].join(' / '),
      processType: [...item._processTypeSet].join(' / '),
    }));

    return { aggregated, checkedCount };
  }, [bomRows, purchaseUnits]);

  function exportCSV() {
    const headers = visibleCols.map((c) => c.label).join(',');
    const rows = aggregated.map((item) =>
      visibleCols.map((c) => {
        const v = c.key === 'parents'
          ? item.parents.join(' / ')
          : c.key === 'qtyTotal'
          ? String(item.qtyTotal ?? '')
          : String(item[c.key] ?? '');
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')
    ).join('\n');
    const blob = new Blob(['﻿' + headers + '\n' + rows], { type: 'text/csv;charset=utf-8;' });
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
        <div className="flex items-center gap-2">
          <ColumnManager visible={colVisible} onToggle={toggleColVisible} />
          <button
            onClick={exportCSV}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded shrink-0"
          >CSV 내보내기</button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-auto">
        <table
          className="border-collapse"
          style={{ minWidth: visibleCols.reduce((s, c) => s + c.w, 0) + 'px' }}
        >
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100 dark:bg-gray-800">
              {visibleCols.map((col) => (
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
                {visibleCols.map((col) => {
                  if (col.key === 'no') {
                    return (
                      <td key="no" style={{ width: col.w, minWidth: col.w }}
                        className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-center text-gray-500 dark:text-gray-400">
                        {item.no}
                      </td>
                    );
                  }
                  if (col.key === 'childPart') {
                    return (
                      <td key="childPart" style={{ width: col.w, minWidth: col.w }}
                        className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 font-mono font-semibold text-blue-700 dark:text-blue-300 whitespace-nowrap">
                        {item.childPart}
                      </td>
                    );
                  }
                  if (col.key === 'description') {
                    return (
                      <td key="description" style={{ width: col.w, minWidth: col.w }}
                        className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
                        {item.description}
                      </td>
                    );
                  }
                  if (col.key === 'unit') {
                    return (
                      <td key="unit" style={{ width: col.w, minWidth: col.w }}
                        className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-center text-gray-600 dark:text-gray-400">
                        {item.unit}
                      </td>
                    );
                  }
                  if (col.key === 'qtyTotal') {
                    return (
                      <td key="qtyTotal" style={{ width: col.w, minWidth: col.w }}
                        className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-right font-bold text-gray-900 dark:text-white">
                        {typeof item.qtyTotal === 'number' ? item.qtyTotal.toLocaleString() : item.qtyTotal}
                      </td>
                    );
                  }
                  if (col.key === 'parents') {
                    return (
                      <td key="parents" style={{ width: col.w, minWidth: col.w }}
                        className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                        {item.parents.join(' / ')}
                      </td>
                    );
                  }
                  // staNo, processType, spec, material, vendor, remark
                  return (
                    <td key={col.key} style={{ width: col.w, minWidth: col.w }}
                      className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                      {item[col.key] ?? ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
