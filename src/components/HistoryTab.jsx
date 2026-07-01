import { Fragment, useMemo, useState } from 'react';
import { useBOM } from '../context/BOMContext';

function formatDateKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const TYPE_LABEL = { revision: '리비전 교체', append: '파트 추가' };
const TYPE_BADGE = {
  revision: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  append: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
};

function PartList({ items, emptyLabel, qtyMode }) {
  if (!items || items.length === 0) {
    return <span className="text-gray-300 dark:text-gray-600">{emptyLabel}</span>;
  }
  return (
    <ul className="space-y-0.5">
      {items.map((p, i) => (
        <li key={i} className="font-mono text-xs">
          {p.partNumber || '(품번없음)'}
          <span className="text-gray-400 font-sans"> · {p.description || '—'}</span>
          {qtyMode && p.qtyFrom != null && (
            <span className="text-red-500 font-sans font-semibold"> ({p.qtyFrom}→{p.qtyTo})</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function HistoryTab() {
  const { state, dispatch } = useBOM();
  const history = state.history || [];

  // 날짜별 그룹 (최신 날짜가 위로)
  const dateKeys = useMemo(() => {
    const set = new Set(history.map((h) => formatDateKey(h.date)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [history]);

  const [selectedDate, setSelectedDate] = useState(dateKeys[0] || '');
  const [expanded, setExpanded] = useState(new Set());
  const [drawingFilter, setDrawingFilter] = useState('');
  const [checkedIds, setCheckedIds] = useState(new Set());

  // dateKeys가 바뀌어도(예: 선택된 날짜의 항목이 전부 삭제됨) 유효한 날짜를 유지
  const effectiveSelectedDate = dateKeys.includes(selectedDate) ? selectedDate : (dateKeys[0] || '');

  const entriesForDate = useMemo(() => {
    return history
      .filter((h) => formatDateKey(h.date) === effectiveSelectedDate)
      .filter((h) => !drawingFilter || h.drawingNumber.toLowerCase().includes(drawingFilter.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [history, effectiveSelectedDate, drawingFilter]);

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleChecked(id) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllChecked() {
    setCheckedIds((prev) => {
      const allChecked = entriesForDate.length > 0 && entriesForDate.every((h) => prev.has(h.id));
      return allChecked ? new Set() : new Set(entriesForDate.map((h) => h.id));
    });
  }

  function deleteOne(id) {
    if (!confirm('이 수정이력 항목을 삭제하시겠습니까?')) return;
    dispatch({ type: 'DELETE_HISTORY_ENTRIES', ids: [id] });
    setCheckedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  function deleteChecked() {
    if (checkedIds.size === 0) return;
    if (!confirm(`선택한 ${checkedIds.size}개 수정이력을 삭제하시겠습니까?`)) return;
    dispatch({ type: 'DELETE_HISTORY_ENTRIES', ids: [...checkedIds] });
    setCheckedIds(new Set());
  }

  const allCheckedForDate = entriesForDate.length > 0 && entriesForDate.every((h) => checkedIds.has(h.id));

  if (history.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        아직 기록된 수정이력이 없습니다.<br />
        <span className="text-xs">(리비전 교체 또는 파트 추가 시 자동으로 기록됩니다)</span>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* 왼쪽: 날짜 목록 (최신이 위로, 세로 정렬) */}
      <aside className="w-44 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
        <p className="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          날짜
        </p>
        <ul>
          {dateKeys.map((k) => {
            const isActive = k === effectiveSelectedDate;
            return (
              <li key={k}>
                <button
                  onClick={() => setSelectedDate(k)}
                  className={`w-full text-left px-3 py-2 text-xs font-medium border-l-2 transition-colors flex items-center justify-between ${
                    isActive
                      ? 'bg-white dark:bg-gray-800 text-indigo-700 dark:text-indigo-300 border-indigo-500'
                      : 'text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <span>{k}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                    {history.filter((h) => formatDateKey(h.date) === k).length}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* 오른쪽: 선택한 날짜의 이력 목록 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 shrink-0">
          <input
            value={drawingFilter}
            onChange={(e) => setDrawingFilter(e.target.value)}
            placeholder="도면번호 검색..."
            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-indigo-500 flex-1 max-w-xs"
          />
          {checkedIds.size > 0 && (
            <button
              onClick={deleteChecked}
              className="text-xs bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 rounded font-medium"
            >
              선택 삭제 ({checkedIds.size})
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">{effectiveSelectedDate} · {entriesForDate.length}건</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
              <tr>
                <th className="w-8 px-2 py-2 border-b border-gray-200 dark:border-gray-700">
                  <input type="checkbox" checked={allCheckedForDate} onChange={toggleAllChecked} className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer" />
                </th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">시간</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">도면번호</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">구분</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">REV 변경</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">파트수</th>
                <th className="px-3 py-2 text-right font-semibold text-green-600 dark:text-green-400 border-b border-gray-200 dark:border-gray-700">신규</th>
                <th className="px-3 py-2 text-right font-semibold text-amber-600 dark:text-amber-400 border-b border-gray-200 dark:border-gray-700">변경</th>
                <th className="px-3 py-2 text-right font-semibold text-red-600 dark:text-red-400 border-b border-gray-200 dark:border-gray-700">삭제</th>
                <th className="w-8 px-2 py-2 border-b border-gray-200 dark:border-gray-700" />
              </tr>
            </thead>
            <tbody>
              {entriesForDate.length === 0 ? (
                <tr><td colSpan={10} className="text-center text-gray-400 py-8">해당 날짜에 기록이 없습니다.</td></tr>
              ) : entriesForDate.map((h) => {
                const isOpen = expanded.has(h.id);
                const revChanged = h.oldRev !== h.newRev;
                return (
                  <Fragment key={h.id}>
                    <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-950">
                      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checkedIds.has(h.id)}
                          onChange={() => toggleChecked(h.id)}
                          className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap cursor-pointer" onClick={() => toggleExpand(h.id)}>
                        <span className="text-gray-400 mr-1">{isOpen ? '▼' : '▶'}</span>{formatTime(h.date)}
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap cursor-pointer" onClick={() => toggleExpand(h.id)}>{h.drawingNumber}</td>
                      <td className="px-3 py-2 cursor-pointer" onClick={() => toggleExpand(h.id)}>
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${TYPE_BADGE[h.type] || ''}`}>{TYPE_LABEL[h.type] || h.type}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap cursor-pointer" onClick={() => toggleExpand(h.id)}>
                        {revChanged ? (
                          <span><span className="text-gray-400">{h.oldRev || '—'}</span> → <span className="font-bold text-purple-700 dark:text-purple-300">{h.newRev || '—'}</span></span>
                        ) : (
                          <span className="text-gray-400">{h.newRev || '—'} (변경없음)</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600 dark:text-gray-300 cursor-pointer" onClick={() => toggleExpand(h.id)}>
                        {h.partCountBefore} → {h.partCountAfter}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-green-600 dark:text-green-400 cursor-pointer" onClick={() => toggleExpand(h.id)}>{h.added.length || ''}</td>
                      <td className="px-3 py-2 text-right font-semibold text-amber-600 dark:text-amber-400 cursor-pointer" onClick={() => toggleExpand(h.id)}>{h.changed.length || ''}</td>
                      <td className="px-3 py-2 text-right font-semibold text-red-600 dark:text-red-400 cursor-pointer" onClick={() => toggleExpand(h.id)}>{h.removed.length || ''}</td>
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteOne(h.id); }}
                          className="text-red-400 hover:text-red-600 text-xs"
                          title="이 항목 삭제"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-gray-50 dark:bg-gray-900/50">
                        <td colSpan={10} className="px-6 py-3">
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <p className="font-semibold text-green-600 dark:text-green-400 mb-1">신규 추가 ({h.added.length})</p>
                              <PartList items={h.added} emptyLabel="없음" />
                            </div>
                            <div>
                              <p className="font-semibold text-amber-600 dark:text-amber-400 mb-1">수량/사양 변경 ({h.changed.length})</p>
                              <PartList items={h.changed} emptyLabel="없음" qtyMode />
                            </div>
                            <div>
                              <p className="font-semibold text-red-600 dark:text-red-400 mb-1">삭제 ({h.removed.length})</p>
                              <PartList items={h.removed} emptyLabel="없음" />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
