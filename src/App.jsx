import { useState, useEffect, useRef } from 'react';
import { BOMProvider, useBOM } from './context/BOMContext';
import { useDarkMode } from './hooks/useDarkMode';
import { exportToExcel } from './utils/excelExport';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import OCREditor from './components/OCREditor';
import BOMTable from './components/BOMTable';
import ProjectScreen from './components/ProjectScreen';

// ── 프로젝트가 열린 후의 메인 화면 ──────────────────────────────
function AppContent({ onChangeProject, isDark, onToggleDark }) {
  const { state, dispatch } = useBOM();
  const [activeTab, setActiveTab] = useState('register');
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [editDrawing, setEditDrawing] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleDrawingAdded() {
    setActiveTab('bom');
    setEditDrawing(null);
  }

  function handleReRegister(drawing) {
    setEditDrawing(drawing);
    setActiveTab('register');
  }

  // 키보드 단축키
  useEffect(() => {
    function handleKeyDown(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      switch (e.key.toLowerCase()) {
        case 's': {
          e.preventDefault();
          // 저장은 자동이지만 시각 피드백
          break;
        }
        case 'n': {
          e.preventDefault();
          if (confirm('다른 프로젝트를 열겠습니까?')) onChangeProject();
          break;
        }
        case 'e': {
          e.preventDefault();
          if (state.bomRows.length > 0) {
            try { exportToExcel(state); } catch (err) { alert('Excel 내보내기 실패: ' + err.message); }
          }
          break;
        }
        case 'f': {
          e.preventDefault();
          setActiveTab('bom');
          // BOMTable 검색창에 포커스 — CustomEvent 사용
          window.dispatchEvent(new CustomEvent('bom:focus-search'));
          break;
        }
        default:
          break;
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, onChangeProject]);

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-950">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onChangeProject={onChangeProject}
        isDark={isDark}
        onToggleDark={onToggleDark}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />
      <div className="flex flex-1 overflow-hidden relative">
        {/* 모바일 오버레이 */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* 사이드바: 데스크톱 고정, 모바일 드로어 */}
        <div
          className={`
            z-30 flex-shrink-0
            md:relative md:translate-x-0 md:flex
            fixed top-0 left-0 h-full
            transition-transform duration-200
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}
        >
          <Sidebar
            onSelectDrawing={setSelectedDrawingId}
            selectedDrawingId={selectedDrawingId}
            onReRegister={handleReRegister}
            onClose={() => setSidebarOpen(false)}
          />
        </div>

        <main className="flex-1 overflow-hidden">
          {activeTab === 'register' ? (
            <div className="h-full overflow-y-auto p-4">
              <OCREditor
                onDrawingAdded={handleDrawingAdded}
                editDrawing={editDrawing}
                onEditCancel={() => setEditDrawing(null)}
              />
            </div>
          ) : (
            <div className="h-full">
              <BOMTable isDark={isDark} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── 루트 ────────────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useDarkMode();
  // null = 프로젝트 선택 화면, object = 해당 프로젝트 열기
  const [projectMeta, setProjectMeta] = useState(null);

  if (!projectMeta) {
    return <ProjectScreen onSelectProject={setProjectMeta} />;
  }

  return (
    // key를 projectMeta.id로 설정 → 프로젝트 변경 시 BOMProvider 완전 재마운트
    <BOMProvider key={projectMeta.id} projectMeta={projectMeta}>
      <AppContent
        onChangeProject={() => setProjectMeta(null)}
        isDark={isDark}
        onToggleDark={() => setIsDark((d) => !d)}
      />
    </BOMProvider>
  );
}
