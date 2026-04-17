import { useState } from 'react';
import { BOMProvider } from './context/BOMContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import OCREditor from './components/OCREditor';
import BOMTable from './components/BOMTable';
import ProjectScreen from './components/ProjectScreen';

// ── 프로젝트가 열린 후의 메인 화면 ──────────────────────────────
function AppContent({ onChangeProject }) {
  const [activeTab, setActiveTab] = useState('register');
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [editDrawing, setEditDrawing] = useState(null);

  function handleDrawingAdded() {
    setActiveTab('bom');
    setEditDrawing(null);
  }

  function handleReRegister(drawing) {
    setEditDrawing(drawing);
    setActiveTab('register');
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onChangeProject={onChangeProject}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          onSelectDrawing={setSelectedDrawingId}
          selectedDrawingId={selectedDrawingId}
          onReRegister={handleReRegister}
        />
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
              <BOMTable />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── 루트 ────────────────────────────────────────────────────────
export default function App() {
  // null = 프로젝트 선택 화면, object = 해당 프로젝트 열기
  const [projectMeta, setProjectMeta] = useState(null);

  if (!projectMeta) {
    return <ProjectScreen onSelectProject={setProjectMeta} />;
  }

  return (
    // key를 projectMeta.id로 설정 → 프로젝트 변경 시 BOMProvider 완전 재마운트
    <BOMProvider key={projectMeta.id} projectMeta={projectMeta}>
      <AppContent onChangeProject={() => setProjectMeta(null)} />
    </BOMProvider>
  );
}
