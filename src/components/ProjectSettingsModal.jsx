import { useState, useEffect } from 'react';
import { useBOM } from '../context/BOMContext';

export default function ProjectSettingsModal({ onClose }) {
  const { state, dispatch } = useBOM();
  const { project } = state;

  const [name, setName] = useState(project.name);
  const [baseDate, setBaseDate] = useState(project.baseDate || '');
  const [totalQty, setTotalQty] = useState(project.totalQty);
  const [dedupResult, setDedupResult] = useState(null);

  useEffect(() => {
    setName(project.name);
    setBaseDate(project.baseDate || '');
    setTotalQty(project.totalQty);
  }, [project]);

  function save() {
    if (!name.trim()) { alert('프로젝트명을 입력하세요.'); return; }
    dispatch({
      type: 'SET_PROJECT_INFO',
      payload: { name: name.trim(), baseDate, totalQty: parseInt(totalQty) || 1 },
    });
    onClose();
  }

  function handleKey(e) {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter') save();
  }

  function deduplicateAllDrawings() {
    let totalRemoved = 0;
    const affectedDrawings = [];

    const newDrawings = state.drawings.map((d) => {
      const seen = new Set();
      const deduped = d.parts.filter((p) => {
        if (!p.partNumber) return true;
        if (seen.has(p.partNumber)) return false;
        seen.add(p.partNumber);
        return true;
      });
      const removed = d.parts.length - deduped.length;
      if (removed > 0) {
        totalRemoved += removed;
        affectedDrawings.push(`${d.drawingNumber} (${removed}개 제거)`);
      }
      return removed > 0 ? { ...d, parts: deduped, updatedAt: new Date().toISOString() } : d;
    });

    if (totalRemoved === 0) {
      setDedupResult({ type: 'none' });
      return;
    }

    const ok = confirm(
      `다음 도면에서 중복 자품번이 발견되었습니다:\n\n${affectedDrawings.slice(0, 10).join('\n')}${affectedDrawings.length > 10 ? `\n...외 ${affectedDrawings.length - 10}개` : ''}\n\n총 ${totalRemoved}개 중복 행을 제거하시겠습니까?\n(동일 자품번 중 seq 기준 첫 번째만 유지)`
    );
    if (!ok) return;

    dispatch({ type: 'REPLACE_ALL_DRAWINGS', drawings: newDrawings });
    setDedupResult({ type: 'done', count: totalRemoved, drawingCount: affectedDrawings.length });
  }

  const dupSummary = (() => {
    let total = 0;
    let drawingCount = 0;
    for (const d of state.drawings) {
      const seen = new Set();
      let hasDup = false;
      for (const p of d.parts) {
        if (!p.partNumber) continue;
        if (seen.has(p.partNumber)) { total++; hasDup = true; }
        seen.add(p.partNumber);
      }
      if (hasDup) drawingCount++;
    }
    return { total, drawingCount };
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKey}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-blue-700 text-white px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-lg">프로젝트 설정</h2>
          <button onClick={onClose} className="text-blue-200 hover:text-white text-xl leading-none">✕</button>
        </div>

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

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
            <p>📋 등록 도면: <strong className="text-gray-700">{state.drawings.length}개</strong></p>
            <p>📊 BOM 행: <strong className="text-gray-700">{state.bomRows.length}행</strong></p>
            {project.createdAt && (
              <p>📅 생성일: {new Date(project.createdAt).toLocaleDateString('ko-KR')}</p>
            )}
          </div>

          {/* 중복 자품번 일괄 정리 */}
          <div className={`rounded-lg border p-3 ${dupSummary.total > 0 ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-700">중복 자품번 정리</p>
              {dupSummary.total > 0 ? (
                <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full font-medium">
                  ⚠ {dupSummary.drawingCount}개 도면 · {dupSummary.total}개 중복
                </span>
              ) : (
                <span className="text-xs text-green-600 font-medium">✓ 중복 없음</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-2">
              동일 자품번이 한 도면에 여러 번 등록된 경우 첫 번째만 남기고 제거합니다.
            </p>
            {dedupResult?.type === 'done' && (
              <p className="text-xs text-green-700 mb-2 font-medium">
                ✓ {dedupResult.drawingCount}개 도면에서 {dedupResult.count}개 중복 행 제거 완료
              </p>
            )}
            {dedupResult?.type === 'none' && (
              <p className="text-xs text-green-700 mb-2">✓ 중복이 없습니다.</p>
            )}
            <button
              onClick={deduplicateAllDrawings}
              disabled={dupSummary.total === 0}
              className="w-full text-xs py-1.5 rounded font-medium bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white transition-colors"
            >
              전체 도면 중복 자품번 일괄 제거
            </button>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100">
            취소
          </button>
          <button onClick={save} className="px-6 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
