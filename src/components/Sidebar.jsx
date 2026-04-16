import { useBOM } from '../context/BOMContext';

export default function Sidebar({ onSelectDrawing, selectedDrawingId }) {
  const { state, dispatch } = useBOM();
  const { drawings } = state;

  function deleteDrawing(e, id) {
    e.stopPropagation();
    if (confirm('이 도면을 삭제하시겠습니까?')) {
      dispatch({ type: 'DELETE_DRAWING', drawingId: id });
      if (selectedDrawingId === id) onSelectDrawing(null);
    }
  }

  return (
    <aside className="w-56 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
      <div className="px-3 py-2 bg-gray-100 border-b border-gray-200">
        <h2 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
          등록된 도면 ({drawings.length})
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {drawings.length === 0 ? (
          <p className="text-xs text-gray-400 p-3">등록된 도면이 없습니다.</p>
        ) : (
          <ul className="py-1">
            {drawings.map((d) => (
              <li
                key={d.id}
                onClick={() => onSelectDrawing(d.id)}
                className={`px-3 py-2 cursor-pointer border-b border-gray-100 hover:bg-blue-50 group flex items-start justify-between ${
                  selectedDrawingId === d.id ? 'bg-blue-100 border-l-2 border-l-blue-500' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-mono font-semibold text-blue-800 truncate">
                    {d.drawingNumber || '(번호 없음)'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{d.title || '-'}</p>
                  <p className="text-xs text-gray-400">REV: {d.rev || '-'} · {d.parts.length}개 파트</p>
                </div>
                <button
                  onClick={(e) => deleteDrawing(e, d.id)}
                  className="ml-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 text-xs shrink-0 mt-0.5"
                  title="삭제"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
