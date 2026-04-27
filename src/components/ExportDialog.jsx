import { useState } from 'react';

export default function ExportDialog({ onExport, onClose }) {
  const [choice, setChoice] = useState('both');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="bg-green-700 text-white px-5 py-3 flex justify-between items-center">
          <p className="font-bold text-sm">Excel 내보내기</p>
          <button onClick={onClose} className="text-green-200 hover:text-white">✕</button>
        </div>
        <div className="p-5">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">내보낼 BOM을 선택하세요.</p>
          <div className="space-y-2">
            {[
              { id: 'ebom', label: 'E-BOM만', desc: '전체 부품 전개 BOM (모든 행)' },
              { id: 'mbom', label: 'M-BOM만', desc: '구매단위 체크된 부품 집계 목록' },
              { id: 'both', label: '둘 다 (권장)', desc: 'E-BOM + M-BOM 시트 모두 내보내기' },
            ].map(({ id, label, desc }) => (
              <label
                key={id}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  choice === id
                    ? 'border-green-500 bg-green-50 dark:bg-green-950 dark:border-green-600'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  value={id}
                  checked={choice === id}
                  onChange={() => setChoice(id)}
                  className="accent-green-600"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
                </div>
              </label>
            ))}
          </div>
          <button
            onClick={() => { onExport(choice); onClose(); }}
            className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-lg text-sm transition-colors"
          >
            내보내기
          </button>
        </div>
      </div>
    </div>
  );
}
