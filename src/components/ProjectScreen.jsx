import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { listProjects, deleteProject } from '../utils/db';

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function ProjectScreen({ onSelectProject }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState(33);
  const [newDate, setNewDate] = useState('');

  useEffect(() => {
    listProjects().then((list) => {
      setProjects(list);
      setLoading(false);
    });
  }, []);

  async function handleDelete(e, id) {
    e.stopPropagation();
    const p = projects.find((x) => x.project?.id === id || x.id === id);
    const name = p?.project?.name || p?.name || '이 프로젝트';
    if (!confirm(`"${name}"를 삭제하시겠습니까? 복구할 수 없습니다.`)) return;
    await deleteProject(id);
    setProjects((prev) => prev.filter((x) => (x.project?.id || x.id) !== id));
  }

  function handleCreate() {
    if (!newName.trim()) {
      alert('프로젝트명을 입력하세요.');
      return;
    }
    const id = uuidv4();
    onSelectProject({
      id,
      name: newName.trim(),
      baseDate: newDate,
      totalQty: parseInt(newQty) || 33,
      createdAt: new Date().toISOString(),
    });
  }

  function handleOpen(p) {
    onSelectProject({
      id: p.project?.id || p.id,
      name: p.project?.name,
      baseDate: p.project?.baseDate,
      totalQty: p.project?.totalQty,
      createdAt: p.project?.createdAt,
      _load: true, // 기존 프로젝트 불러오기 신호
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex flex-col items-center justify-center p-8">
      {/* 로고 */}
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold text-white tracking-tight mb-2">BOM Builder</h1>
        <p className="text-blue-200 text-sm">도면 파트리스트 → BOM 자동 생성</p>
      </div>

      <div className="w-full max-w-3xl">
        {/* 새 프로젝트 카드 */}
        {!creating ? (
          <button
            onClick={() => { setCreating(true); setNewName(''); setNewQty(33); setNewDate(''); }}
            className="w-full mb-6 bg-white/10 hover:bg-white/20 border-2 border-dashed border-white/40 hover:border-white/70 text-white rounded-xl p-6 flex items-center gap-4 transition-all group"
          >
            <span className="text-4xl group-hover:scale-110 transition-transform">＋</span>
            <div className="text-left">
              <p className="font-bold text-lg">새 프로젝트 만들기</p>
              <p className="text-blue-200 text-sm">새 BOM 프로젝트를 시작합니다.</p>
            </div>
          </button>
        ) : (
          <div className="mb-6 bg-white rounded-xl p-6 shadow-xl">
            <h2 className="text-base font-bold text-gray-700 mb-4">새 프로젝트 설정</h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">프로젝트명 *</label>
                <input
                  autoFocus
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="예: 객차 외장 BOM"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">총 생산 수량 (량)</label>
                <input
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  type="number"
                  min={1}
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">기준일</label>
                <input
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="flex-1 bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 rounded text-sm"
              >
                프로젝트 생성
              </button>
              <button
                onClick={() => setCreating(false)}
                className="px-5 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded text-sm"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* 기존 프로젝트 목록 */}
        <div>
          <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-3">
            저장된 프로젝트 ({projects.length})
          </h2>
          {loading ? (
            <p className="text-blue-200 text-sm text-center py-6">불러오는 중...</p>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 text-blue-200/60">
              <p className="text-3xl mb-2">📂</p>
              <p className="text-sm">저장된 프로젝트가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {projects.map((p) => {
                const id = p.project?.id || p.id;
                const name = p.project?.name || '(이름 없음)';
                const updatedAt = p.project?.updatedAt;
                const createdAt = p.project?.createdAt;
                const drawingCount = p.drawings?.length || 0;
                const totalQty = p.project?.totalQty;

                return (
                  <div
                    key={id}
                    onClick={() => handleOpen(p)}
                    className="bg-white/95 hover:bg-white rounded-xl px-5 py-4 cursor-pointer flex items-center justify-between group shadow-lg hover:shadow-xl transition-all"
                  >
                    <div>
                      <p className="font-bold text-gray-800 text-base">{name}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>📋 도면 {drawingCount}개</span>
                        {totalQty && <span>⚙️ {totalQty}량</span>}
                        <span>수정: {fmt(updatedAt || createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-blue-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        열기 →
                      </span>
                      <button
                        onClick={(e) => handleDelete(e, id)}
                        className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm px-2 py-1 rounded hover:bg-red-50"
                        title="삭제"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
