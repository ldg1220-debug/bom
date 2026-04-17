import { useState } from 'react';
import { useBOM } from '../context/BOMContext';
import { exportToExcel } from '../utils/excelExport';
import ProjectSettingsModal from './ProjectSettingsModal';

export default function Header({ activeTab, setActiveTab, onChangeProject }) {
  const { state, dispatch } = useBOM();
  const [showSettings, setShowSettings] = useState(false);
  const [exporting, setExporting] = useState(false);

  function handleExcelExport() {
    setExporting(true);
    try {
      exportToExcel(state);
    } catch (err) {
      alert('Excel 내보내기 실패: ' + err.message);
      console.error(err);
    } finally {
      setExporting(false);
    }
  }

  function handleJSONExport() {
    const { bomRows, circularWarnings, ...exportData } = state;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.download = `BOM_${state.project.name}_${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleJSONImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.project) throw new Error('유효하지 않은 BOM 파일입니다.');
        dispatch({ type: 'LOAD_PROJECT', data });
      } catch (err) {
        alert('JSON 파일을 읽을 수 없습니다: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const { project, drawings, bomRows } = state;

  return (
    <>
      <header className="bg-blue-800 text-white px-4 py-2 flex items-center justify-between shadow-md shrink-0">
        {/* 왼쪽: 로고 + 프로젝트 정보 */}
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-extrabold tracking-tight">BOM Builder</h1>
          <div className="h-4 w-px bg-blue-500" />
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 hover:bg-blue-700 rounded px-2 py-1 transition-colors"
            title="프로젝트 설정"
          >
            <span className="font-semibold text-sm">{project.name}</span>
            <span className="text-blue-300 text-xs">
              {project.totalQty}량 · 도면 {drawings.length}개 · BOM {bomRows.length}행
            </span>
            <span className="text-blue-300 text-xs">⚙️</span>
          </button>
        </div>

        {/* 가운데: 탭 */}
        <div className="flex bg-blue-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setActiveTab('register')}
            className={`px-5 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'register' ? 'bg-white text-blue-800' : 'hover:bg-blue-600'
            }`}
          >
            도면 등록
          </button>
          <button
            onClick={() => setActiveTab('bom')}
            className={`px-5 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'bom' ? 'bg-white text-blue-800' : 'hover:bg-blue-600'
            }`}
          >
            BOM 테이블
          </button>
        </div>

        {/* 오른쪽: 내보내기 / 불러오기 / 프로젝트 변경 */}
        <div className="flex items-center gap-1.5">
          {/* Excel 내보내기 */}
          <button
            onClick={handleExcelExport}
            disabled={exporting || bomRows.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-3 py-1.5 rounded font-medium"
            title="Excel(.xlsx) 내보내기"
          >
            {exporting ? '생성 중...' : '📊 Excel'}
          </button>

          {/* JSON 내보내기 */}
          <button
            onClick={handleJSONExport}
            className="bg-teal-600 hover:bg-teal-700 text-white text-xs px-3 py-1.5 rounded font-medium"
            title="JSON 백업 내보내기"
          >
            💾 JSON
          </button>

          {/* JSON 불러오기 */}
          <label
            className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-3 py-1.5 rounded font-medium cursor-pointer"
            title="JSON 파일 불러오기"
          >
            📂 불러오기
            <input type="file" accept=".json" className="hidden" onChange={handleJSONImport} />
          </label>

          {/* 프로젝트 변경 */}
          {onChangeProject && (
            <button
              onClick={onChangeProject}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded font-medium border border-blue-400"
              title="다른 프로젝트 열기"
            >
              🗂 프로젝트
            </button>
          )}
        </div>
      </header>

      {/* 프로젝트 설정 모달 */}
      {showSettings && <ProjectSettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
