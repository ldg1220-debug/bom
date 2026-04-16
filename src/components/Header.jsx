import { useState } from 'react';
import { useBOM } from '../context/BOMContext';

export default function Header({ activeTab, setActiveTab }) {
  const { state, dispatch } = useBOM();
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(state.project.name);
  const [qtyVal, setQtyVal] = useState(state.project.totalQty);

  function saveProject() {
    dispatch({
      type: 'SET_PROJECT_INFO',
      payload: { name: nameVal, totalQty: parseInt(qtyVal) || 1 },
    });
    setEditing(false);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.project.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const project = JSON.parse(ev.target.result);
        dispatch({ type: 'IMPORT_PROJECT', project });
      } catch {
        alert('JSON 파일을 읽을 수 없습니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <header className="bg-blue-800 text-white px-4 py-2 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold tracking-wide">BOM Builder</h1>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              className="text-black text-sm px-2 py-1 rounded"
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              placeholder="프로젝트명"
            />
            <label className="text-xs">총량수:</label>
            <input
              className="text-black text-sm px-2 py-1 rounded w-16"
              type="number"
              value={qtyVal}
              onChange={(e) => setQtyVal(e.target.value)}
              min={1}
            />
            <button
              onClick={saveProject}
              className="bg-green-500 hover:bg-green-600 text-white text-xs px-3 py-1 rounded"
            >
              저장
            </button>
            <button
              onClick={() => setEditing(false)}
              className="bg-gray-500 hover:bg-gray-600 text-white text-xs px-3 py-1 rounded"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setNameVal(state.project.name); setQtyVal(state.project.totalQty); setEditing(true); }}
            className="text-sm text-blue-200 hover:text-white flex items-center gap-1"
          >
            <span className="font-semibold">{state.project.name}</span>
            <span className="text-xs opacity-75">(총 {state.project.totalQty}량) ✏️</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex bg-blue-700 rounded overflow-hidden">
          <button
            onClick={() => setActiveTab('register')}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'register' ? 'bg-white text-blue-800' : 'hover:bg-blue-600'
            }`}
          >
            도면 등록
          </button>
          <button
            onClick={() => setActiveTab('bom')}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'bom' ? 'bg-white text-blue-800' : 'hover:bg-blue-600'
            }`}
          >
            BOM 테이블
          </button>
        </div>

        <button
          onClick={exportJSON}
          className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded"
        >
          내보내기
        </button>
        <label className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-3 py-1.5 rounded cursor-pointer">
          불러오기
          <input type="file" accept=".json" className="hidden" onChange={importJSON} />
        </label>
      </div>
    </header>
  );
}
