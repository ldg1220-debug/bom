import { useState, useEffect } from 'react';
import { useBOM } from '../context/BOMContext';

export default function ProjectSettingsModal({ onClose }) {
  const { state, dispatch } = useBOM();
  const { project } = state;

  const [name, setName] = useState(project.name);
  const [baseDate, setBaseDate] = useState(project.baseDate || '');
  const [totalQty, setTotalQty] = useState(project.totalQty);

  useEffect(() => {
    setName(project.name);
    setBaseDate(project.baseDate || '');
    setTotalQty(project.totalQty);
  }, [project]);

  function save() {
    if (!name.trim()) { alert('프로젝트명을 입력하세요.'); return; }
    dispatch({
      type: 'SET_PROJECT_INFO',
      payload: {
        name: name.trim(),
        baseDate,
        totalQty: parseInt(totalQty) || 1,
      },
    });
    onClose();
  }

  function handleKey(e) {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter') save();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKey}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* 헤더 */}
        <div className="bg-blue-700 text-white px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-lg">프로젝트 설정</h2>
          <button onClick={onClose} className="text-blue-200 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* 폼 */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">프로젝트명 *</label>
            <input
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="프로젝트명을 입력하세요"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">기준일</label>
              <input
                type="date"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={baseDate}
                onChange={(e) => setBaseDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">총 생산 수량 (량)</label>
              <input
                type="number"
                min={1}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={totalQty}
                onChange={(e) => setTotalQty(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">총수량 = 1량 × {totalQty || '?'}</p>
            </div>
          </div>

          {/* 프로젝트 정보 요약 */}
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
            <p>📋 등록 도면: <strong className="text-gray-700">{state.drawings.length}개</strong></p>
            <p>📊 BOM 행: <strong className="text-gray-700">{state.bomRows.length}행</strong></p>
            {project.createdAt && (
              <p>📅 생성일: {new Date(project.createdAt).toLocaleDateString('ko-KR')}</p>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
          >
            취소
          </button>
          <button
            onClick={save}
            className="px-6 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
