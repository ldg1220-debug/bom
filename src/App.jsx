import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import XLSX from 'xlsx-js-style';
import { BOMProvider, useBOM } from './context/BOMContext';
import { useDarkMode } from './hooks/useDarkMode';
import { exportToExcel, exportMBOMToExcel } from './utils/excelExport';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import OCREditor from './components/OCREditor';
import BOMTable from './components/BOMTable';
import MBOMTable from './components/MBOMTable';
import ProjectScreen from './components/ProjectScreen';
import ExportDialog from './components/ExportDialog';
import RevisionHistoryModal from './components/RevisionHistoryModal';

// ── 엑셀 불러오기 ────────────────────────────────────────────────
function importFromExcel(file, dispatch, onDone) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets['BOM'];
      if (!ws) { alert('BOM 시트를 찾을 수 없습니다.\n내보내기한 Excel 파일을 선택하세요.'); return; }

      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      // 첫 4행은 헤더; 5행부터 데이터
      const dataRows = rows.slice(4).filter((r) => r[15] != null && String(r[15]).trim() !== '');

      // drawingNumber → { drawingNumber, title, rev, parts[] }
      const drawingsMap = new Map();

      for (const row of dataRows) {
        const childPart = String(row[15] || '').trim();
        const parentPart = String(row[12] || '').trim();
        const description = String(row[16] || '').trim();
        const rev = String(row[13] || '').trim();
        const no = row[14];
        const material = String(row[17] || '').trim();
        const spec = String(row[18] || '').trim();
        const unit = String(row[23] || '').trim();
        const unitQty = parseFloat(row[24]) || 1;
        const remark = String(row[28] || '').trim();
        const staNo = String(row[9] || '').trim();
        const processType = String(row[10] || '').trim();
        const vendor = String(row[15 + 14] || '').trim(); // not in export, skip

        const isAssyRow = !no || String(no).trim() === '';

        if (isAssyRow) {
          if (childPart && !drawingsMap.has(childPart)) {
            drawingsMap.set(childPart, {
              drawingNumber: childPart,
              title: description,
              rev,
              parts: [],
            });
          }
        } else {
          if (parentPart && !drawingsMap.has(parentPart)) {
            drawingsMap.set(parentPart, {
              drawingNumber: parentPart,
              title: '',
              rev: '',
              parts: [],
            });
          }
          if (parentPart) {
            const d = drawingsMap.get(parentPart);
            d.parts.push({
              seq: parseInt(no) || d.parts.length + 1,
              partNumber: childPart,
              description,
              material,
              qty: unitQty,
              unit: unit || 'EA',
              specRemark: remark,
              spec,
              staNo,
              processType,
            });
          }
        }
      }

      let count = 0;
      for (const drawing of drawingsMap.values()) {
        dispatch({
          type: 'ADD_DRAWING',
          drawing: {
            ...drawing,
            id: uuidv4(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
        count++;
      }
      alert(`${count}개 도면을 불러왔습니다.`);
      onDone && onDone();
    } catch (err) {
      alert('Excel 불러오기 실패: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── 프로젝트가 열린 후의 메인 화면 ──────────────────────────────
function AppContent({ onChangeProject, isDark, onToggleDark }) {
  const { state, dispatch } = useBOM();
  const [activeTab, setActiveTab] = useState('register');
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [editDrawing, setEditDrawing] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('bom:sidebar:collapsed') === 'true'; } catch { return false; }
  });
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const importInputRef = useRef(null);

  function handleDrawingAdded() {
    setActiveTab('ebom');
    setEditDrawing(null);
  }

  function handleReRegister(drawing) {
    setEditDrawing(drawing);
    setActiveTab('register');
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem('bom:sidebar:collapsed', String(next)); } catch {}
      return next;
    });
  }

  function handleExport(choice) {
    try {
      if (choice === 'ebom') exportToExcel(state);
      else if (choice === 'mbom') exportMBOMToExcel(state);
      else { exportToExcel(state); exportMBOMToExcel(state); }
    } catch (err) {
      alert('Excel 내보내기 실패: ' + err.message);
    }
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    importFromExcel(file, dispatch, () => {
      setActiveTab('ebom');
    });
    e.target.value = '';
  }

  // 키보드 단축키
  useEffect(() => {
    function handleKeyDown(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      switch (e.key.toLowerCase()) {
        case 'n': {
          e.preventDefault();
          if (confirm('다른 프로젝트를 열겠습니까?')) onChangeProject();
          break;
        }
        case 'e': {
          e.preventDefault();
          if (state.bomRows.length > 0) setShowExportDialog(true);
          break;
        }
        case 'f': {
          e.preventDefault();
          setActiveTab('ebom');
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
        onOpenExport={() => { if (state.bomRows.length > 0) setShowExportDialog(true); }}
        onOpenImport={() => importInputRef.current?.click()}
        onOpenHistory={() => setShowHistory(true)}
      />
      <div className="flex flex-1 overflow-hidden relative">
        {/* 모바일 오버레이 */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* 사이드바 */}
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
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebarCollapsed}
          />
        </div>

        <main className="flex-1 overflow-hidden">
          {/* 탭 전환 시 상태 유지를 위해 hidden CSS 사용 (언마운트 방지) */}
          <div className={`h-full overflow-y-auto p-4 ${activeTab === 'register' ? '' : 'hidden'}`}>
            <OCREditor
              onDrawingAdded={handleDrawingAdded}
              editDrawing={editDrawing}
              onEditCancel={() => setEditDrawing(null)}
            />
          </div>

          <div className={`h-full ${activeTab === 'ebom' ? '' : 'hidden'}`}>
            <BOMTable
              isDark={isDark}
              onOpenImport={() => importInputRef.current?.click()}
              onOpenExport={() => setShowExportDialog(true)}
            />
          </div>

          <div className={`h-full ${activeTab === 'mbom' ? '' : 'hidden'}`}>
            <MBOMTable />
          </div>
        </main>
      </div>

      {/* 숨겨진 파일 입력 */}
      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleImportFile}
      />

      {showExportDialog && (
        <ExportDialog onExport={handleExport} onClose={() => setShowExportDialog(false)} />
      )}

      {showHistory && (
        <RevisionHistoryModal onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}

// ── 루트 ────────────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useDarkMode();
  const [projectMeta, setProjectMeta] = useState(null);

  if (!projectMeta) {
    return <ProjectScreen onSelectProject={setProjectMeta} />;
  }

  return (
    <BOMProvider key={projectMeta.id} projectMeta={projectMeta}>
      <AppContent
        onChangeProject={() => setProjectMeta(null)}
        isDark={isDark}
        onToggleDark={() => setIsDark((d) => !d)}
      />
    </BOMProvider>
  );
}
