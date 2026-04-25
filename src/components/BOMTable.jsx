import { useState, useMemo, useRef, useCallback } from 'react';
import { useBOM } from '../context/BOMContext';

// ── 레벨별 배경색 (Lv1~8+) ───────────────────────────────────
const LV_BG_LIGHT = ['', '#FFF9C4', '#C8E6C9', '#DBEAFE', '#EDE9FE', '#FCE7F3', '#FED7AA', '#CFFAFE'];
const LV_BG_DARK  = ['', '#3B3600', '#0A2E10', '#0C1F3F', '#1E0F3F', '#3F0F24', '#3F1E00', '#0C2F33'];

// 고정 컬럼 (숨길 수 없음)
const EBOM_FIXED_KEYS = new Set(['_drag', 'seq', 'level', 'no', 'childPart', 'description', '_purchase', 'unitQty', 'qtyTotal', '_link']);

// 부품 데이터에 영속화되는 필드
const DRAWING_PERSIST_KEYS = new Set(['vendor', 'staNo', 'processType', 'spec']);

function getLevelBg(level, isDark) {
  const arr = isDark ? LV_BG_DARK : LV_BG_LIGHT;
  return arr[level - 1] ?? (isDark ? '#1a2030' : '#F3F4F6');
}

// ── collapse 필터 (DFS 순서 기반) ───────────────────────────
function applyCollapse(rows, collapsed) {
  const visible = [];
  const hideStack = [];
  for (const row of rows) {
    while (hideStack.length > 0 && row.level <= hideStack[hideStack.length - 1]) {
      hideStack.pop();
    }
    if (hideStack.length > 0) continue;
    visible.push(row);
    if (row.isAssyRow && collapsed.has(row.childPart)) {
      hideStack.push(row.level);
    }
  }
  return visible;
}

function countDescendants(rows, rootChildPart) {
  let count = 0, inside = false, parentLevel = null;
  for (const row of rows) {
    if (!inside && row.childPart === rootChildPart && row.isAssyRow) {
      inside = true; parentLevel = row.level; continue;
    }
    if (inside) {
      if (row.level <= parentLevel) break;
      count++;
    }
  }
  return count;
}

// ── 검색어 하이라이트 ────────────────────────────────────────
function Highlight({ text, query }) {
  if (!query || !text) return <>{text ?? ''}</>;
  const str = String(text);
  const idx = str.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{str}</>;
  return (
    <>
      {str.slice(0, idx)}
      <mark className="bg-yellow-300 dark:bg-yellow-600 text-black dark:text-white rounded-sm px-0.5">
        {str.slice(idx, idx + query.length)}
      </mark>
      {str.slice(idx + query.length)}
    </>
  );
}

// ── 더블클릭 인라인 편집 셀 ──────────────────────────────────
function EditableCell({ rowId, field, value, onUpdate, align = 'left', mono = false, className = '', query = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function startEdit() {
    setDraft(value ?? '');
    setEditing(true);
  }

  function commit(val) {
    onUpdate(rowId, field, val);
    setEditing(false);
  }

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
        className={`w-full px-1.5 py-0.5 text-xs bg-blue-50 dark:bg-blue-900 border border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 ${mono ? 'font-mono' : ''} text-${align}`}
      />
    );
  }

  return (
    <div
      onDoubleClick={startEdit}
      title="더블클릭하여 편집"
      className={`px-1.5 py-1 text-xs cursor-text select-none min-h-[24px] ${mono ? 'font-mono' : ''} text-${align} ${className}`}
    >
      {value != null && value !== ''
        ? (query ? <Highlight text={String(value)} query={query} /> : value)
        : <span className="text-gray-300 dark:text-gray-600">—</span>}
    </div>
  );
}

// ── 열 표시/숨기기 관리자 ────────────────────────────────────────
function ColumnManager({ colDefs, fixedKeys, hiddenCols, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const optional = colDefs.filter((c) => c.label && !fixedKeys.has(c.key));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs border border-gray-300 dark:border-gray-600 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center gap-1"
        title="열 표시 설정"
      >
        ⚙ 열
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl p-3 w-52">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
              열 표시 설정
            </p>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {optional.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1.5 py-1"
                >
                  <input
                    type="checkbox"
                    checked={!hiddenCols.has(col.key)}
                    onChange={() => onToggle(col.key)}
                    className="w-3.5 h-3.5 accent-blue-600"
                  />
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

// ── 수동 연결 모달 ────────────────────────────────────────────
function LinkDrawingModal({ row, drawings, onLink, onClose }) {
  const [query, setQuery] = useState('');
  const filtered = drawings.filter(
    (d) =>
      d.drawingNumber !== row.childPart &&
      (d.drawingNumber.toLowerCase().includes(query.toLowerCase()) ||
        d.title.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-blue-700 text-white px-5 py-3 flex justify-between items-center">
          <div>
            <p className="font-bold text-sm">하위 도면 연결</p>
            <p className="text-blue-200 text-xs">{row.childPart} — {row.description}</p>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white">✕</button>
        </div>
        <div className="p-4">
          <input
            autoFocus
            className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm mb-3 focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="도면번호 또는 제목 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">일치하는 도면이 없습니다.</p>
            ) : (
              filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onLink(d.drawingNumber)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900 border border-gray-100 dark:border-gray-700"
                >
                  <p className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-300">{d.drawingNumber}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{d.title} · REV {d.rev}</p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 컬럼 정의 ─────────────────────────────────────────────────
const EDITABLE_KEYS = new Set([
  'itemType', 'staNo', 'processType', 'drawingDate',
  'rev', 'spec', 'sizeT', 'sizeW', 'sizeL', 'weight', 'unit', 'remark',
]);

function makeColDefs(totalQty) {
  return [
    { label: '', key: '_drag', w: 20, readOnly: true },
    { label: '순번', key: 'seq', w: 40, readOnly: true },
    { label: 'LV', key: 'level', w: 32, readOnly: true },
    { label: '품목구분', key: 'itemType', w: 60 },
    { label: 'STA NO.', key: 'staNo', w: 72 },
    { label: '공정구분', key: 'processType', w: 60 },
    { label: '출도도면일자', key: 'drawingDate', w: 88 },
    { label: '모품번', key: 'parentPart', w: 140, readOnly: true },
    { label: 'REV', key: 'rev', w: 44 },
    { label: 'NO.', key: 'no', w: 36, readOnly: true },
    { label: '자품번', key: 'childPart', w: 144, readOnly: true },
    { label: '품명', key: 'description', w: 320 },
    { label: '구매단위', key: '_purchase', w: 56, readOnly: true },
    { label: '재질', key: 'material', w: 88, readOnly: true },
    { label: '제작업체', key: 'vendor', w: 100 },
    { label: '규격SPEC', key: 'spec', w: 88 },
    { label: 'T', key: 'sizeT', w: 44 },
    { label: 'W', key: 'sizeW', w: 44 },
    { label: 'L', key: 'sizeL', w: 44 },
    { label: '단중(Kg)', key: 'weight', w: 64 },
    { label: '단위', key: 'unit', w: 44 },
    { label: '단위소요량', key: 'unitQty', w: 72, readOnly: true },
    { label: '배수', key: 'multiplier', w: 48, readOnly: true },
    { label: '1량', key: 'qtyPerOne', w: 60, readOnly: true },
    { label: `총(×${totalQty})`, key: 'qtyTotal', w: 80, readOnly: true },
    { label: '비고', key: 'remark', w: 140 },
    { label: '', key: '_link', w: 32, readOnly: true },
  ];
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export default function BOMTable({ isDark = false, searchRef }) {
  const { state, dispatch } = useBOM();
  const { bomRows, project, circularWarnings } = state;

  const [collapsed, setCollapsed] = useState(new Set());
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState(0);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [linkRow, setLinkRow] = useState(null);

  // 열 표시/숨김 상태 (localStorage 저장)
  const [hiddenCols, setHiddenCols] = useState(() => {
    try {
      const saved = localStorage.getItem('bom:col:ebom');
      return new Set(saved ? JSON.parse(saved) : []);
    } catch { return new Set(); }
  });

  function toggleCol(key) {
    if (EBOM_FIXED_KEYS.has(key)) return;
    setHiddenCols((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      localStorage.setItem('bom:col:ebom', JSON.stringify([...next]));
      return next;
    });
  }

  const colDefs = useMemo(() => makeColDefs(project.totalQty), [project.totalQty]);

  const visibleColDefs = useMemo(
    () => colDefs.filter((c) => !hiddenCols.has(c.key)),
    [colDefs, hiddenCols]
  );

  const internalSearchRef = useRef(null);
  const resolvedSearchRef = searchRef || internalSearchRef;

  const isFiltering = searchText.trim() || typeFilter !== 'all' || levelFilter > 0;

  const displayRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!isFiltering) return applyCollapse(bomRows, collapsed);
    return bomRows.filter((row) => {
      if (typeFilter === 'assy' && !row.isAssyRow) return false;
      if (typeFilter === 'parts' && row.isAssyRow) return false;
      if (levelFilter > 0 && row.level !== levelFilter) return false;
      if (q) {
        return (
          (row.childPart || '').toLowerCase().includes(q) ||
          (row.description || '').toLowerCase().includes(q) ||
          (row.material || '').toLowerCase().includes(q) ||
          (row.parentPart || '').toLowerCase().includes(q) ||
          (row.remark || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [bomRows, collapsed, isFiltering, searchText, typeFilter, levelFilter]);

  const treeConnectors = useMemo(() => {
    const assyIdx = {};
    displayRows.forEach((r, i) => { if (r.isAssyRow) assyIdx[r.childPart] = i; });
    return displayRows.map((row, i) => {
      if (row.level <= 1) return null;
      const L = row.level;
      const segments = [];
      for (let lvl = 2; lvl <= L; lvl++) {
        if (lvl === L) {
          let isLast = true;
          for (let j = i + 1; j < displayRows.length; j++) {
            if (displayRows[j].level < L) break;
            if (displayRows[j].level === L && displayRows[j].parentPart === row.parentPart) { isLast = false; break; }
          }
          segments.push(isLast ? '└─' : '├─');
        } else {
          let current = row;
          while (current.level > lvl) {
            const pi = assyIdx[current.parentPart];
            if (pi === undefined) break;
            current = displayRows[pi];
          }
          const found = current.level === lvl ? current : null;
          if (!found) { segments.push('   '); continue; }
          let hasMore = false;
          for (let j = i + 1; j < displayRows.length; j++) {
            if (displayRows[j].level < lvl) break;
            if (displayRows[j].level === lvl && displayRows[j].parentPart === found.parentPart) { hasMore = true; break; }
          }
          segments.push(hasMore ? '│ ' : '  ');
        }
      }
      return segments.join('');
    });
  }, [displayRows]);

  const toggleCollapse = useCallback((childPart) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(childPart) ? next.delete(childPart) : next.add(childPart);
      return next;
    });
  }, []);

  const updateRow = useCallback((id, field, value) => {
    dispatch({ type: 'UPDATE_BOM_ROW', rowId: id, fields: { [field]: value } });
  }, [dispatch]);

  const updateDrawingPart = useCallback((id, field, value) => {
    const row = bomRows.find((r) => r.id === id);
    if (!row) return;
    dispatch({ type: 'UPDATE_DRAWING_PART', drawingId: row.drawingId, isAssyRow: row.isAssyRow, partSeq: row.no, fields: { [field]: value } });
  }, [bomRows, dispatch]);

  function handleDragStart(e, row) {
    if (row.isAssyRow) { e.preventDefault(); return; }
    setDragId(row.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, row) {
    e.preventDefault();
    if (!dragId || row.isAssyRow) return;
    const fromRow = bomRows.find((r) => r.id === dragId);
    if (!fromRow) return;
    if (fromRow.level === row.level && fromRow.parentPart === row.parentPart && fromRow.drawingId === row.drawingId) {
      setDragOverId(row.id);
      e.dataTransfer.dropEffect = 'move';
    }
  }

  function handleDrop(e, toRow) {
    e.preventDefault();
    const fromRow = bomRows.find((r) => r.id === dragId);
    if (
      fromRow &&
      !fromRow.isAssyRow &&
      !toRow.isAssyRow &&
      fromRow.level === toRow.level &&
      fromRow.drawingId === toRow.drawingId &&
      fromRow.id !== toRow.id
    ) {
      dispatch({
        type: 'REORDER_PART',
        drawingId: fromRow.drawingId,
        fromSeq: fromRow.no,
        toSeq: toRow.no,
      });
    }
    setDragId(null);
    setDragOverId(null);
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

  function handleLink(targetDrawingNumber) {
    if (!linkRow) return;
    dispatch({
      type: 'LINK_PART_TO_DRAWING',
      drawingId: linkRow.drawingId,
      partSeq: linkRow.no,
      targetDrawingNumber,
    });
    setLinkRow(null);
  }

  function exportCSV() {
    const cols = visibleColDefs.filter((c) => c.key !== '_drag' && c.key !== '_link');
    const headers = cols.map((c) => c.label).join(',');
    const rows = bomRows.map((row) =>
      cols.map((c) => {
        const v = String(row[c.key] ?? '');
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')
    ).join('\n');
    const blob = new Blob(['﻿' + headers + '\n' + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}_BOM.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (bomRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
        <p className="text-5xl mb-4">📊</p>
        <p className="text-lg font-medium text-gray-500 dark:text-gray-400">BOM이 비어있습니다</p>
        <p className="text-sm mt-1">도면 등록 탭에서 도면을 추가하면 BOM이 자동으로 생성됩니다.</p>
      </div>
    );
  }

  const maxLevel = Math.max(...bomRows.map((r) => r.level), 1);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {circularWarnings?.length > 0 && (
        <div className="mx-4 mt-2 bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-700 rounded p-3 text-xs text-red-700 dark:text-red-300 flex items-start justify-between shrink-0">
          <div>
            <p className="font-bold mb-1">⚠️ 순환 참조가 감지되었습니다</p>
            {circularWarnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
          <button
            onClick={() => dispatch({ type: 'CLEAR_CIRCULAR_WARNINGS' })}
            className="ml-3 text-red-400 hover:text-red-600 shrink-0"
          >✕</button>
        </div>
      )}

      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-40">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
          <input
            ref={resolvedSearchRef}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="자품번·품명·재질·비고 검색... (Ctrl+F)"
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white"
          />
          {searchText && (
            <button
              onClick={() => setSearchText('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >✕</button>
          )}
        </div>

        <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 text-xs">
          {[['all', '전체'], ['assy', 'ASSY'], ['parts', '부품']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setTypeFilter(v)}
              className={`px-2.5 py-1.5 ${typeFilter === v ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
            >{l}</button>
          ))}
        </div>

        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(Number(e.target.value))}
          className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 focus:outline-none bg-white dark:bg-gray-700 dark:text-white"
        >
          <option value={0}>전체 레벨</option>
          {Array.from({ length: maxLevel }, (_, i) => i + 1).map((l) => (
            <option key={l} value={l}>Level {l}</option>
          ))}
        </select>

        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {displayRows.length} / {bomRows.length}행
          {isFiltering && <span className="ml-1 text-blue-500">(필터 중)</span>}
        </span>

        <div className="flex items-center gap-1 ml-auto">
          <div className="hidden md:flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mr-2">
            {LV_BG_LIGHT.slice(1, Math.min(maxLevel, 8)).map((bg, i) => (
              <span key={i} className="flex items-center gap-0.5">
                <span className="w-3 h-3 rounded border border-gray-300" style={{ background: bg }} />
                <span>L{i + 2}</span>
              </span>
            ))}
          </div>
          <button
            onClick={() => setCollapsed(new Set())}
            className="text-xs text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900"
          >전체 펼치기</button>
          <button
            onClick={() => {
              const assy = new Set(bomRows.filter((r) => r.isAssyRow).map((r) => r.childPart));
              setCollapsed(assy);
            }}
            className="text-xs text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >전체 접기</button>
          <ColumnManager colDefs={colDefs} fixedKeys={EBOM_FIXED_KEYS} hiddenCols={hiddenCols} onToggle={toggleCol} />
          <button
            onClick={exportCSV}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded"
          >CSV</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table
          className="border-collapse"
          style={{ minWidth: visibleColDefs.reduce((s, c) => s + c.w, 0) + 'px' }}
        >
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100 dark:bg-gray-800">
              {visibleColDefs.map((col) => (
                <th
                  key={col.key}
                  style={{ minWidth: col.w, width: col.w }}
                  className="px-1.5 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 border-b-2 border-r border-gray-300 dark:border-gray-600 whitespace-nowrap text-left"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => {
              const bg = getLevelBg(row.level, isDark);
              const isDragging = dragId === row.id;
              const isDragOver = dragOverId === row.id;
              const hasChildren = row.isAssyRow && bomRows.some((r) => r.parentPart === row.childPart);
              const isCollapsed = collapsed.has(row.childPart);
              const q = searchText.trim().toLowerCase();
              const isLinked = row.isAssyRow || state.drawings.some((d) => d.drawingNumber === row.childPart);
              const canLink = !row.isAssyRow && !!row.drawingId && !!row.no;

              return (
                <tr
                  key={row.id}
                  style={{ backgroundColor: bg || undefined }}
                  data-rev-deleted={row._deletedInRev ? '' : undefined}
                  className={[
                    'border-b border-gray-200 dark:border-gray-700',
                    'hover:brightness-95 dark:hover:brightness-110',
                    isDragging ? 'opacity-40' : '',
                    isDragOver ? 'outline outline-2 outline-blue-400' : '',
                    !bg ? 'bg-white dark:bg-gray-900' : '',
                    row._deletedInRev ? 'rev-deleted-row' : '',
                  ].join(' ')}
                  draggable={!row.isAssyRow}
                  onDragStart={(e) => handleDragStart(e, row)}
                  onDragOver={(e) => handleDragOver(e, row)}
                  onDrop={(e) => handleDrop(e, row)}
                  onDragEnd={handleDragEnd}
                >
                  {visibleColDefs.map((col) => {
                    const value = row[col.key];

                    if (col.key === '_drag') {
                      return (
                        <td key="_drag" style={{ width: col.w, minWidth: col.w }}
                          className="border-r border-gray-200 dark:border-gray-700 text-center">
                          {!row.isAssyRow && (
                            <span className="text-gray-300 dark:text-gray-600 cursor-grab text-xs select-none" title="드래그하여 순서 변경">⠿</span>
                          )}
                        </td>
                      );
                    }

                    if (col.key === '_link') {
                      return (
                        <td key="_link" style={{ width: col.w, minWidth: col.w }}
                          className="border-r border-gray-200 dark:border-gray-700 text-center px-0.5">
                          {canLink && !isLinked && (
                            <button
                              onClick={() => setLinkRow(row)}
                              className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded px-1 py-0.5 hover:bg-blue-50 dark:hover:bg-blue-900"
                              title="하위 도면 연결"
                            >⟳</button>
                          )}
                          {canLink && isLinked && (
                            <span className="text-green-500 text-xs" title="도면 연결됨">✓</span>
                          )}
                        </td>
                      );
                    }

                    if (col.key === 'description') {
                      const treePrefix = treeConnectors[rowIndex];
                      return (
                        <td key="description" style={{ width: col.w, minWidth: col.w }}
                          className="border-r border-gray-200 dark:border-gray-700 px-0 py-0">
                          <div className="flex items-center">
                            {treePrefix != null && (
                              <span className="font-mono text-gray-400 dark:text-gray-500 text-xs shrink-0 select-none whitespace-pre">
                                {treePrefix}
                              </span>
                            )}
                            {hasChildren ? (
                              <button
                                onClick={() => toggleCollapse(row.childPart)}
                                className="w-5 shrink-0 text-center text-xs text-gray-400 hover:text-blue-600"
                              >{isCollapsed ? '▶' : '▼'}</button>
                            ) : (
                              <span className="w-5 shrink-0" />
                            )}
                            <EditableCell
                              rowId={row.id}
                              field="description"
                              value={row.description}
                              onUpdate={updateDrawingPart}
                              query={q}
                              className={`flex-1 min-w-0 truncate ${row.isAssyRow ? 'font-semibold text-blue-900 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'}`}
                            />
                            {isCollapsed && (
                              <span className="text-xs text-gray-400 pr-1 shrink-0">
                                +{countDescendants(bomRows, row.childPart)}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    }

                    if (col.key === 'childPart') {
                      return (
                        <td key="childPart" style={{ width: col.w, minWidth: col.w }}
                          className="px-1.5 py-1 text-xs border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                          <span className={`font-mono ${row.isAssyRow ? 'font-bold text-blue-800 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                            <Highlight text={value} query={q} />
                          </span>
                        </td>
                      );
                    }

                    if (col.key === '_purchase') {
                      if (row.isAssyRow) {
                        return (
                          <td key="_purchase" style={{ width: col.w, minWidth: col.w }}
                            className="border-r border-gray-200 dark:border-gray-700" />
                        );
                      }
                      const pKey = `${row.drawingId}:${row.no}`;
                      const checked = state.purchaseUnits?.has(pKey) || false;
                      return (
                        <td key="_purchase" style={{ width: col.w, minWidth: col.w }}
                          className="border-r border-gray-200 dark:border-gray-700 text-center px-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => dispatch({ type: 'TOGGLE_PURCHASE_UNIT', key: pKey })}
                            className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                            title="구매단위 체크 → M-BOM에 집계"
                          />
                        </td>
                      );
                    }

                    if (col.key === 'material') {
                      if (!row.isAssyRow) {
                        return (
                          <td key="material" style={{ width: col.w, minWidth: col.w }}
                            className="border-r border-gray-200 dark:border-gray-700 px-0 py-0">
                            <EditableCell rowId={row.id} field="material" value={value} onUpdate={updateDrawingPart} query={q} className="text-gray-700 dark:text-gray-300" />
                          </td>
                        );
                      }
                      return (
                        <td key="material" style={{ width: col.w, minWidth: col.w }}
                          className="px-1.5 py-1 text-xs border-r border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                          <Highlight text={value} query={q} />
                        </td>
                      );
                    }

                    if (col.key === 'level') {
                      return (
                        <td key="level" style={{ width: col.w, minWidth: col.w }}
                          className="px-1.5 py-1 text-xs border-r border-gray-200 dark:border-gray-700 text-center font-bold text-gray-600 dark:text-gray-400">
                          {value}
                        </td>
                      );
                    }

                    if (col.key === 'unitQty') {
                      if (!row.isAssyRow) {
                        if (row._qtyChangedFrom != null) {
                          return (
                            <td key="unitQty" style={{ width: col.w, minWidth: col.w }}
                              className="border-r border-gray-200 dark:border-gray-700 px-1.5 py-1 text-right">
                              <span className="text-red-600 dark:text-red-400 font-bold text-xs">{value}</span>
                              <div className="text-gray-400 line-through text-xs leading-none">{row._qtyChangedFrom}</div>
                            </td>
                          );
                        }
                        return (
                          <td key="unitQty" style={{ width: col.w, minWidth: col.w }}
                            className="border-r border-gray-200 dark:border-gray-700 px-0 py-0">
                            <EditableCell rowId={row.id} field="unitQty" value={value} onUpdate={updateDrawingPart} align="right" className="text-gray-700 dark:text-gray-300 font-medium" />
                          </td>
                        );
                      }
                      return (
                        <td key="unitQty" style={{ width: col.w, minWidth: col.w }}
                          className="px-1.5 py-1 text-xs border-r border-gray-200 dark:border-gray-700 text-right text-gray-700 dark:text-gray-300">
                          {value ?? ''}
                        </td>
                      );
                    }

                    if (col.key === 'qtyPerOne' || col.key === 'qtyTotal') {
                      return (
                        <td key={col.key} style={{ width: col.w, minWidth: col.w }}
                          className="px-1.5 py-1 text-xs border-r border-gray-200 dark:border-gray-700 text-right whitespace-nowrap font-medium text-gray-700 dark:text-gray-300">
                          {typeof value === 'number' ? value.toLocaleString() : value}
                        </td>
                      );
                    }

                    if (col.readOnly) {
                      return (
                        <td key={col.key} style={{ width: col.w, minWidth: col.w }}
                          className="px-1.5 py-1 text-xs border-r border-gray-200 dark:border-gray-700 whitespace-nowrap text-gray-700 dark:text-gray-300">
                          {value ?? ''}
                        </td>
                      );
                    }

                    // ── 편집 가능 컬럼 (더블클릭) ──
                    const onUpd = (!row.isAssyRow && DRAWING_PERSIST_KEYS.has(col.key))
                      ? updateDrawingPart : updateRow;
                    return (
                      <td key={col.key} style={{ width: col.w, minWidth: col.w }}
                        className="border-r border-gray-200 dark:border-gray-700 px-0 py-0">
                        <EditableCell
                          rowId={row.id}
                          field={col.key}
                          value={value}
                          onUpdate={onUpd}
                          className="dark:text-gray-200"
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

      {linkRow && (
        <LinkDrawingModal
          row={linkRow}
          drawings={state.drawings}
          onLink={handleLink}
          onClose={() => setLinkRow(null)}
        />
      )}
    </div>
  );
}
