import { useState } from 'react';
import { useBOM } from '../context/BOMContext';
import ProjectSettingsModal from './ProjectSettingsModal';

export default function Header({ activeTab, setActiveTab, onChangeProject, isDark, onToggleDark, onToggleSidebar, onOpenExport, onOpenImport, onOpenHistory, onOpenSavePoints }) {
  const { state } = useBOM();
  const [showSettings, setShowSettings] = useState(false);

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
          {[
            { id: 'register', label: '도면 등록' },
            { id: 'ebom',     label: 'E-BOM'   },
            { id: 'mbom',     label: 'M-BOM'   },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 sm:px-5 py-1.5 text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'bg-white text-blue-800 dark:bg-gray-200 dark:text-gray-900'
                  : 'hover:bg-blue-600 dark:hover:bg-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 오른쪽: 수정이력 / Excel / 다크모드 / 프로젝트 변경 */}
        <div className="flex items-center gap-1.5">
          {/* 세이브 포인트 */}
          <button
            onClick={onOpenSavePoints}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded font-medium hidden sm:block"
            title="이전 세이브 포인트로 복원 (48시간 보관)"
          >
            🕒 세이브 포인트
          </button>

          {/* 수정이력 */}
          <button
            onClick={onOpenHistory}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded font-medium hidden sm:block"
            title="리비전/파트 수정이력 보기"
          >
            📋 수정이력
          </button>

          {/* Excel 내보내기 */}
          <button
            onClick={onOpenExport}
            disabled={bomRows.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-3 py-1.5 rounded font-medium hidden sm:block"
            title="Excel(.xlsx) 내보내기 (Ctrl+E)"
          >
            EXCEL 내보내기
          </button>

          {/* Excel 불러오기 */}
          <button
            onClick={onOpenImport}
            className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded font-medium hidden sm:block"
            title="Excel 파일 불러오기"
          >
            EXCEL 불러오기
          </button>

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
