import { useState } from 'react';
import { useBOM } from '../context/BOMContext';
import { exportToExcel } from '../utils/excelExport';
import ProjectSettingsModal from './ProjectSettingsModal';

export default function Header({ activeTab, setActiveTab, onChangeProject, isDark, onToggleDark, onToggleSidebar }) {
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
      <header className="bg-blue-800 dark:bg-gray-900 text-white px-4 py-2 flex items-center justify-between shadow-md shrink-0">
        {/* 왼쪽: 햄버거(모바일) + 로고 + 프로젝트 정보 */}
        <div className="flex items-center gap-3">
          {/* 모바일 사이드바 토글 */}
          <button
            onClick={onToggleSidebar}
            className="md:hidden hover:bg-blue-700 dark:hover:bg-gray-700 rounded p-1 transition-colors"
            title="사이드바 열기/닫기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <h1 className="text-lg font-extrabold tracking-tight hidden sm:block">BOM Builder</h1>
          <div className="h-4 w-px bg-blue-500 hidden sm:block" />
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 hover:bg-blue-700 dark:hover:bg-gray-700 rounded px-2 py-1 transition-colors"
            title="프로젝트 설정"
          >
            <span className="font-semibold text-sm">{project.name}</span>
            <span className="text-blue-300 dark:text-gray-400 text-xs hidden sm:inline">
              {project.totalQty}량 · 도면 {drawings.length}개 · BOM {bomRows.length}행
            </span>
            <span className="text-blue-300 dark:text-gray-400 text-xs">⚙️</span>
          </button>
        </div>

        {/* 가운데: 탭 */}
        <div className="flex bg-blue-700 dark:bg-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setActiveTab('register')}
            className={`px-4 sm:px-5 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'register'
                ? 'bg-white text-blue-800 dark:bg-gray-200 dark:text-gray-900'
                : 'hover:bg-blue-600 dark:hover:bg-gray-600'
            }`}
          >
            도면 등록
          </button>
          <button
            onClick={() => setActiveTab('bom')}
            className={`px-4 sm:px-5 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'bom'
                ? 'bg-white text-blue-800 dark:bg-gray-200 dark:text-gray-900'
                : 'hover:bg-blue-600 dark:hover:bg-gray-600'
            }`}
          >
            BOM 테이블
          </button>
        </div>

        {/* 오른쪽: 내보내기 / 불러오기 / 다크모드 / 프로젝트 변경 */}
        <div className="flex items-center gap-1.5">
          {/* Excel 내보내기 */}
          <button
            onClick={handleExcelExport}
            disabled={exporting || bomRows.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-3 py-1.5 rounded font-medium hidden sm:block"
            title="Excel(.xlsx) 내보내기 (Ctrl+E)"
          >
            {exporting ? '생성 중...' : '📊 Excel'}
          </button>

          {/* JSON 내보내기 */}
          <button
            onClick={handleJSONExport}
            className="bg-teal-600 hover:bg-teal-700 text-white text-xs px-3 py-1.5 rounded font-medium hidden sm:block"
            title="JSON 백업 내보내기"
          >
            💾 JSON
          </button>

          {/* JSON 불러오기 */}
          <label
            className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-3 py-1.5 rounded font-medium cursor-pointer hidden sm:block"
            title="JSON 파일 불러오기"
          >
            📂 불러오기
            <input type="file" accept=".json" className="hidden" onChange={handleJSONImport} />
          </label>

          {/* 다크모드 토글 */}
          <button
            onClick={onToggleDark}
            className="bg-blue-600 dark:bg-gray-600 hover:bg-blue-500 dark:hover:bg-gray-500 text-white text-xs px-2.5 py-1.5 rounded font-medium border border-blue-400 dark:border-gray-400"
            title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          {/* 프로젝트 변경 */}
          {onChangeProject && (
            <button
              onClick={onChangeProject}
              className="bg-blue-600 dark:bg-gray-600 hover:bg-blue-500 dark:hover:bg-gray-500 text-white text-xs px-3 py-1.5 rounded font-medium border border-blue-400 dark:border-gray-400"
              title="다른 프로젝트 열기 (Ctrl+N)"
            >
              🗂 <span className="hidden sm:inline">프로젝트</span>
            </button>
          )}
        </div>
      </header>

      {showSettings && <ProjectSettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
