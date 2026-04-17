import { useState } from 'react';
import { useBOM } from '../context/BOMContext';

export default function Sidebar({ onSelectDrawing, selectedDrawingId, onReRegister }) {
  const { state, dispatch } = useBOM();
  const { drawings, bomRows } = state;
  const [expandedId, setExpandedId] = useState(null);

  function handleDrawingClick(id) {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    onSelectDrawing(next);
  }

  function deleteDrawing(e, drawing) {
    e.stopPropagation();
    // 이 도면이 하위 도면들의 부모 역할인지 확인
    const childDrawingNumbers = drawing.parts
      .map((p) => p.partNumber)
      .filter((pn) => drawings.some((d) => d.drawingNumber === pn));

    let msg = `"${drawing.drawingNumber}" 도면을 삭제하시겠습니까?`;
    if (childDrawingNumbers.length > 0) {
      msg += `\n\n하위 도면(${childDrawingNumbers.join(', ')})은 독립 도면으로 전환됩니다.`;
    }
    if (confirm(msg)) {
      dispatch({ type: 'DELETE_DRAWING', drawingId: drawing.id });
      if (selectedDrawingId === drawing.id) {
        onSelectDrawing(null);
        setExpandedId(null);
      }
    }
  }

  function handleReRegister(e, drawing) {
    e.stopPropagation();
    onReRegister && onReRegister(drawing);
  }

  // 이 도면이 BOM 어느 계층에 있는지 확인
  function getDrawingLevel(drawingNumber) {
    const row = bomRows.find((r) => r.childPart === drawingNumber && r.isAssyRow);
    return row ? row.level : null;
  }

  return (
    <aside className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full shrink-0">
      <div className="px-3 py-2 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
          등록된 도면 ({drawings.length})
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {drawings.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-gray-400">등록된 도면이 없습니다.</p>
            <p className="text-xs text-gray-300 mt-1">도면 등록 탭에서 추가하세요.</p>
          </div>
        ) : (
          <ul>
            {drawings.map((d) => {
              const level = getDrawingLevel(d.drawingNumber);
              const isExpanded = expandedId === d.id;

              return (
                <li key={d.id} className="border-b border-gray-100">
                  {/* 도면 아이템 헤더 */}
                  <div
                    onClick={() => handleDrawingClick(d.id)}
                    className={`px-3 py-2 cursor-pointer hover:bg-blue-50 group flex items-start justify-between transition-colors ${
                      selectedDrawingId === d.id
                        ? 'bg-blue-50 border-l-2 border-l-blue-500'
                        : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        {level && (
                          <span
                            className="text-xs px-1 rounded font-bold shrink-0"
                            style={{
                              backgroundColor: level === 1 ? '#e5e7eb' : level === 2 ? '#FFF9C4' : '#C8E6C9',
                              color: '#374151',
                              fontSize: '10px',
                            }}
                          >
                            L{level}
                          </span>
                        )}
                        <p className="text-xs font-mono font-semibold text-blue-800 truncate">
                          {d.drawingNumber || '(번호 없음)'}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{d.title || '—'}</p>
                      <p className="text-xs text-gray-400">
                        REV: {d.rev || '—'} &middot; {d.parts.length}개 파트
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      <span className="text-gray-300 text-xs">{isExpanded ? '▲' : '▼'}</span>
                      <button
                        onClick={(e) => deleteDrawing(e, d)}
                        className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 text-xs transition-opacity"
                        title="도면 삭제"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* 확장 상세 패널 */}
                  {isExpanded && (
                    <div className="bg-white border-t border-gray-100 px-3 py-2">
                      {/* 액션 버튼 */}
                      <div className="flex gap-2 mb-2">
                        <button
                          onClick={(e) => handleReRegister(e, d)}
                          className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
                        >
                          재등록
                        </button>
                      </div>

                      {/* 파트리스트 미니 테이블 */}
                      {d.parts.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="px-1 py-0.5 text-left text-gray-500 font-medium w-6">No</th>
                                <th className="px-1 py-0.5 text-left text-gray-500 font-medium">PART NO.</th>
                                <th className="px-1 py-0.5 text-left text-gray-500 font-medium">품명</th>
                                <th className="px-1 py-0.5 text-right text-gray-500 font-medium w-8">수량</th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.parts.map((p) => {
                                const isRegistered = drawings.some(
                                  (dw) => dw.drawingNumber === p.partNumber
                                );
                                return (
                                  <tr key={p.seq} className="border-t border-gray-50">
                                    <td className="px-1 py-0.5 text-gray-400">{p.seq}</td>
                                    <td
                                      className={`px-1 py-0.5 font-mono truncate max-w-[80px] ${
                                        isRegistered ? 'text-blue-600 font-semibold' : 'text-gray-600'
                                      }`}
                                      title={p.partNumber}
                                    >
                                      {p.partNumber || '—'}
                                    </td>
                                    <td className="px-1 py-0.5 text-gray-600 truncate max-w-[80px]" title={p.description}>
                                      {p.description || '—'}
                                    </td>
                                    <td className="px-1 py-0.5 text-right text-gray-600">{p.qty}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <p className="text-xs text-blue-500 mt-1">
                            * 파란색: 등록된 도면
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">파트리스트 없음</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
