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

export default function RevisionHistoryModal({ onClose }) {
  const { state } = useBOM();
  const history = state.history || [];

  const dateKeys = useMemo(() => {
    const set = new Set(history.map((h) => formatDateKey(h.date)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [history]);

  const [selectedDate, setSelectedDate] = useState(dateKeys[0] || '');
  const [expanded, setExpanded] = useState(new Set());
  const [drawingFilter, setDrawingFilter] = useState('');

  const entriesForDate = useMemo(() => {
    return history
      .filter((h) => formatDateKey(h.date) === selectedDate)
      .filter((h) => !drawingFilter || h.drawingNumber.toLowerCase().includes(drawingFilter.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [history, selectedDate, drawingFilter]);

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="bg-indigo-700 text-white px-5 py-3 flex justify-between items-center shrink-0">
          <div>
            <p className="font-bold text-sm">📋 수정이력</p>
            <p className="text-indigo-200 text-xs">리비전 교체 / 파트 추가 변경 내역</p>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white">✕</button>
        </div>

        {history.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-16">
            아직 기록된 수정이력이 없습니다.<br />
            <span className="text-xs">(리비전 교체 또는 파트 추가 시 자동으로 기록됩니다)</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 px-5 pt-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0 overflow-x-auto">
              {dateKeys.map((k) => {
                const isActive = k === selectedDate;
                return (
                  <button
                    key={k}
                    onClick={() => setSelectedDate(k)}
                    className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-t-md border border-b-0 transition-colors ${
                      isActive
                        ? 'bg-white dark:bg-gray-800 text-indigo-700 dark:text-indigo-300 border-gray-200 dark:border-gray-700'
                        : 'bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {k}
                    <span className={`ml-1.5 px-1 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                      {history.filter((h) => formatDateKey(h.date) === k).length}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-5 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 shrink-0">
              <input
                value={drawingFilter}
                onChange={(e) => setDrawingFilter(e.target.value)}
                placeholder="도면번호 검색..."
                className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-indigo-500 flex-1 max-w-xs"
              />
              <span className="text-xs text-gray-400 ml-auto">{selectedDate} · {entriesForDate.length}건</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">시간</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">도면번호</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">구분</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">REV 변경</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">파트수</th>
                    <th className="px-3 py-2 text-right font-semibold text-green-600 dark:text-green-400 border-b border-gray-200 dark:border-gray-700">신규</th>
                    <th className="px-3 py-2 text-right font-semibold text-amber-600 dark:text-amber-400 border-b border-gray-200 dark:border-gray-700">변경</th>
                    <th className="px-3 py-2 text-right font-semibold text-red-600 dark:text-red-400 border-b border-gray-200 dark:border-gray-700">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {entriesForDate.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-gray-400 py-8">해당 날짜에 기록이 없습니다.</td></tr>
                  ) : entriesForDate.map((h) => {
                    const isOpen = expanded.has(h.id);
                    const revChanged = h.oldRev !== h.newRev;
                    return (
                      <Fragment key={h.id}>
                        <tr
                          onClick={() => toggleExpand(h.id)}
                          className="border-b border-gray-100 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-950 cursor-pointer"
                        >
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            <span className="text-gray-400 mr-1">{isOpen ? '▼' : '▶'}</span>{formatTime(h.date)}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">{h.drawingNumber}</td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded-full font-medium ${TYPE_BADGE[h.type] || ''}`}>{TYPE_LABEL[h.type] || h.type}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {revChanged ? (
                              <span><span className="text-gray-400">{h.oldRev || '—'}</span> → <span className="font-bold text-purple-700 dark:text-purple-300">{h.newRev || '—'}</span></span>
                            ) : (
                              <span className="text-gray-400">{h.newRev || '—'} (변경없음)</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600 dark:text-gray-300">
                            {h.partCountBefore} → {h.partCountAfter}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-green-600 dark:text-green-400">{h.added.length || ''}</td>
                          <td className="px-3 py-2 text-right font-semibold text-amber-600 dark:text-amber-400">{h.changed.length || ''}</td>
                          <td className="px-3 py-2 text-right font-semibold text-red-600 dark:text-red-400">{h.removed.length || ''}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-gray-50 dark:bg-gray-900/50">
                            <td colSpan={8} className="px-6 py-3">
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
          </>
        )}
      </div>
    </div>
  );
}
