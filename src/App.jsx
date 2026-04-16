import { useState } from 'react';
import { BOMProvider } from './context/BOMContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import OCREditor from './components/OCREditor';
import BOMTable from './components/BOMTable';

function AppContent() {
  const [activeTab, setActiveTab] = useState('register');
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);

  function handleDrawingAdded() {
    setActiveTab('bom');
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          onSelectDrawing={setSelectedDrawingId}
          selectedDrawingId={selectedDrawingId}
        />
        <main className="flex-1 overflow-hidden">
          {activeTab === 'register' ? (
            <div className="h-full overflow-y-auto p-4">
              <OCREditor onDrawingAdded={handleDrawingAdded} />
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

export default function App() {
  return (
    <BOMProvider>
      <AppContent />
    </BOMProvider>
  );
}
