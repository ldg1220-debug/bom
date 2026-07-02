import { useState, useMemo, useRef } from 'react';
import { useBOM } from '../context/BOMContext';

const MBOM_FIXED_KEYS = new Set(['no', 'childPart', 'description', 'unit', 'qtyTotal', 'parents']);

const COLS = [
  { key: 'no',          label: 'No',           w: 40,  readOnly: true  },
  { key: 'staNo',       label: 'Station',      w: 100 },
  { key: 'processType', label: '공정명',        w: 100 },
  { key: 'parents',     label: '모품번 (출처)', w: 220, readOnly: true  },
  { key: 'childPart',   label: '자품번',        w: 160, readOnly: true  },
  { key: 'description', label: '품명',          w: 200 },
  { key: 'spec',        label: '규격',          w: 120 },
  { key: 'material',    label: '재질',          w: 100 },
  { key: 'vendor',      label: '제작업체',      w: 120 },
  { key: 'unit',        label: '단위',          w: 48,  readOnly: true  },
  { key: 'carType',     label: '차종',          w: 100 },
  { key: 'qtyTotal',    label: '총소요량',      w: 88,  readOnly: true  },
  { key: 'domestic',        label: '국내',       w: 56,  type: 'checkbox' },
  { key: 'overseas',        label: '국외',       w: 56,  type: 'checkbox' },
  { key: 'stockMaterial',   label: 'STOCK자재',  w: 80,  type: 'checkbox' },
  { key: 'supplierMaterial', label: '사급자재',  w: 80,  type: 'checkbox' },
  { key: 'supplierSource',  label: '사급처',     w: 120 },
  { key: 'remark',      label: '비고',          w: 160 },
];

// ── 더블클릭 편집 셀 ─────────────────────────────────────────────
function EditableCell({ value, onCommit, align = 'left' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function startEdit() { setDraft(value ?? ''); setEditing(true); }
  function commit(v) { onCommit(v); setEditing(false); }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
          if (e.key === 'Escape') setEditing(false);
          e.stopPropagation();
        }}
        onBlur={() => commit(draft)}
        className={`w-full px-1.5 py-0.5 text-xs bg-blue-50 dark:bg-blue-900 border border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 text-${align}`}
      />
    );
  }

  return (
    <div
      onDoubleClick={startEdit}
      title="더블클릭하여 편집"
      className={`px-2 py-1.5 text-xs cursor-text select-none min-h-[24px] text-${align}`}
    >
      {value != null && value !== ''
        ? value
        : <span className="text-gray-300 dark:text-gray-600">—</span>}
    </div>
  );
}

// ── 열 표시/숨기기 관리자 ────────────────────────────────────────
function ColumnManager({ cols, fixedKeys, hiddenCols, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const optional = cols.filter((c) => !fixedKeys.has(c.key));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs border border-gray-300 dark:border-gray-600 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
        title="열 표시 설정"
      >
        ⚙ 열
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl p-3 w-48">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">열 표시 설정</p>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {optional.map((col) => (
                <label key={col.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1.5 py-1">
                  <input type="checkbox" checked={!hiddenCols.has(col.key)} onChange={() => onToggle(col.key)} className="w-3.5 h-3.5 accent-blue-600" />
                  <span className="text-xs text-gray-700 dark:text-gray-300">{col.label}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const puKey = (row) => `${row.drawingId}:${row.isAssyRow ? 'assy' : row.no}`;

export default function MBOMTable() {
  const { state, dispatch } = useBOM();
  const { bomRows, purchaseUnits = new Set(), project, mbomOverrides = {} } = state;

  const [hiddenCols, setHiddenCols] = useState(() => {
    try {
      const saved = localStorage.getItem('bom:col:mbom');
      return new Set(saved ? JSON.parse(saved) : []);
    } catch { return new Set(); }
  });

  const [colWidths, setColWidths] = useState(() => {
    try { const s = localStorage.getItem('bom:col:mbom:widths'); return s ? JSON.parse(s) : {}; }
    catch { return {}; }
  });
  const resizeRef = useRef(null);

  function getColWidth(col) { return colWidths[col.key] ?? col.w; }

  function startColResize(e, key, currentW) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { key, startX: e.clientX, startW: currentW };
    function onMouseMove(me) {
      if (!resizeRef.current) return;
      const { key: k, startX, startW } = resizeRef.current;
      setColWidths((p) => ({ ...p, [k]: Math.max(30, startW + (me.clientX - startX)) }));
    }
    function onMouseUp() {
      resizeRef.current = null;
      setColWidths((p) => { localStorage.setItem('bom:col:mbom:widths', JSON.stringify(p)); return p; });
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function toggleCol(key) {
    if (MBOM_FIXED_KEYS.has(key)) return;
    setHiddenCols((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      localStorage.setItem('bom:col:mbom', JSON.stringify([...next]));
      return next;
    });
  }

  const visibleCols = useMemo(() => COLS.filter((c) => !hiddenCols.has(c.key)), [hiddenCols]);

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
      // 오버라이드 적용
      const overrides = mbomOverrides[base.childPart] || {};
      return { ...base, ...overrides };
    });
    return { aggregated, checkedCount };
  }, [bomRows, purchaseUnits, mbomOverrides]);

  function handleOverride(childPart, field, value) {
    dispatch({ type: 'UPDATE_MBOM_OVERRIDE', childPart, fields: { [field]: value } });
  }

  function exportCSV() {
    const headers = visibleCols.map((c) => c.label).join(',');
    const rows = aggregated.map((item) =>
      visibleCols.map((c) => {
        const v = c.key === 'parents' ? item.parents.join(' / ')
          : c.type === 'checkbox' ? (item[c.key] ? 'O' : '')
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
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">M-BOM — 구매 목록</h2>
          <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
            {aggregated.length}종
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            (E-BOM 체크 {checkedCount}행 → 동일 자품번 수량 합산)
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 hidden md:inline">
            · 셀 더블클릭으로 편집 가능
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ColumnManager cols={COLS} fixedKeys={MBOM_FIXED_KEYS} hiddenCols={hiddenCols} onToggle={toggleCol} />
          <button
            onClick={exportCSV}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded shrink-0"
          >
            CSV 내보내기
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ minWidth: visibleCols.reduce((s, c) => s + getColWidth(c), 0) + 'px' }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100 dark:bg-gray-800">
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  style={{ minWidth: getColWidth(col), width: getColWidth(col) }}
                  className="relative px-2 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border-b-2 border-r border-gray-300 dark:border-gray-600 whitespace-nowrap text-left select-none"
                >
                  {col.label}
                  {!col.readOnly && col.type !== 'checkbox' && <span className="ml-1 text-blue-300 dark:text-blue-600 text-xs">✎</span>}
                  <div
                    onMouseDown={(e) => startColResize(e, col.key, getColWidth(col))}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 hover:opacity-60 z-20"
                    title="드래그하여 열 폭 조절"
                  />
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
                  const value = col.key === 'parents' ? item.parents.join(' / ') : item[col.key];

                  if (col.key === 'no') {
                    return (
                      <td key="no" style={{ minWidth: getColWidth(col), width: getColWidth(col) }}
                        className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-center text-gray-500 dark:text-gray-400">
                        {value}
                      </td>
                    );
                  }

                  if (col.key === 'childPart') {
                    return (
                      <td key="childPart" style={{ minWidth: getColWidth(col), width: getColWidth(col) }}
                        className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 font-mono font-semibold text-blue-700 dark:text-blue-300 whitespace-nowrap">
                        {value}
                      </td>
                    );
                  }

                  if (col.key === 'qtyTotal') {
                    return (
                      <td key="qtyTotal" style={{ minWidth: getColWidth(col), width: getColWidth(col) }}
                        className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-right font-bold text-gray-900 dark:text-white">
                        {typeof value === 'number' ? value.toLocaleString() : value}
                      </td>
                    );
                  }

                  if (col.key === 'parents') {
                    return (
                      <td key="parents" style={{ minWidth: getColWidth(col), width: getColWidth(col) }}
                        className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                        {value}
                      </td>
                    );
                  }

                  if (col.readOnly) {
                    return (
                      <td key={col.key} style={{ minWidth: getColWidth(col), width: getColWidth(col) }}
                        className="px-2 py-1.5 text-xs border-r border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                        {value || ''}
                      </td>
                    );
                  }

                  if (col.type === 'checkbox') {
                    const isOverridden = mbomOverrides[item.childPart]?.[col.key] != null;
                    return (
                      <td key={col.key} style={{ minWidth: getColWidth(col), width: getColWidth(col) }}
                        className={`border-r border-gray-200 dark:border-gray-700 text-center ${isOverridden ? 'bg-yellow-50 dark:bg-yellow-950' : ''}`}>
                        <input
                          type="checkbox"
                          checked={!!value}
                          onChange={(e) => handleOverride(item.childPart, col.key, e.target.checked)}
                          className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                        />
                      </td>
                    );
                  }

                  // 편집 가능 컬럼
                  const isOverridden = !!(mbomOverrides[item.childPart]?.[col.key] != null);
                  return (
                    <td key={col.key} style={{ minWidth: getColWidth(col), width: getColWidth(col) }}
                      className={`border-r border-gray-200 dark:border-gray-700 px-0 py-0 ${isOverridden ? 'bg-yellow-50 dark:bg-yellow-950' : ''}`}>
                      <EditableCell
                        value={value}
                        onCommit={(v) => handleOverride(item.childPart, col.key, v)}
                      />
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
