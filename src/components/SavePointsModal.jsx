import { useEffect, useState } from 'react';
import { useBOM } from '../context/BOMContext';
import { listCheckpoints, saveManualCheckpoint } from '../utils/db';

function formatDateTime(iso) {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

function hoursLeft(iso) {
  const elapsedMs = Date.now() - new Date(iso).getTime();
  const leftMs = 48 * 60 * 60 * 1000 - elapsedMs;
  return Math.max(0, Math.ceil(leftMs / (60 * 60 * 1000)));
}

export default function SavePointsModal({ onClose }) {
  const { state, dispatch } = useBOM();
  const [checkpoints, setCheckpoints] = useState(null);
  const [restoringId, setRestoringId] = useState(null);

  useEffect(() => {
    listCheckpoints(state.project.id).then(setCheckpoints);
  }, [state.project.id]);

  async function handleRestore(cp) {
    const label = cp.manual ? cp.label : `${cp.dateKey} 세이브 포인트`;
    const ok = confirm(
      `"${label}" 시점으로 되돌릴까요?\n\n` +
      `현재 화면의 내용은 복원 전 백업으로 자동 저장되며, 필요하면 다시 이 목록에서 되돌릴 수 있습니다.`
    );
    if (!ok) return;
    setRestoringId(cp.id);
    try {
      await saveManualCheckpoint(state, '복원 전 백업');
      dispatch({ type: 'LOAD_PROJECT', data: cp.snapshot });
      onClose();
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="bg-indigo-700 text-white px-5 py-3 flex justify-between items-center shrink-0">
          <div>
            <p className="font-bold text-sm">🕒 세이브 포인트</p>
            <p className="text-indigo-200 text-xs">자동저장은 유지하면서, 잘못된 수정 시 이전 시점으로 되돌릴 수 있습니다 (48시간 후 자동 삭제)</p>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {checkpoints === null ? (
            <div className="text-center text-gray-400 text-sm py-10">불러오는 중...</div>
          ) : checkpoints.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-10">
              아직 세이브 포인트가 없습니다.<br />
              <span className="text-xs">(하루에 한 번, 그날 첫 수정 직전 상태가 자동으로 보관됩니다)</span>
            </div>
          ) : (
            <ul className="space-y-2">
              {checkpoints.map((cp) => (
                <li key={cp.id} className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      {cp.manual ? `🔖 ${cp.label}` : `📅 ${cp.dateKey} 세이브 포인트`}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDateTime(cp.createdAt)} 저장 · 도면 {cp.snapshot?.drawings?.length ?? 0}개 · {hoursLeft(cp.createdAt)}시간 후 삭제
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestore(cp)}
                    disabled={restoringId === cp.id}
                    className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded font-medium"
                  >
                    {restoringId === cp.id ? '복원 중...' : '이 시점으로 복원'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
