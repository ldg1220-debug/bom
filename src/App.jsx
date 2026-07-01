import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import XLSX from 'xlsx-js-style';
import { saveProject } from './utils/db';
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
import HistoryTab from './components/HistoryTab';
import SavePointsModal from './components/SavePointsModal';

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

      // 사전 스캔: 품번 → {품명, REV} 인덱스
      // (자품번으로 등장하는 모든 행에서 품명·REV 수집)
      const titleByPart = new Map();
      const revByPart = new Map();
      for (const row of dataRows) {
        const partNum = String(row[15] || '').trim();
        const desc = String(row[16] || '').trim();
        const r = String(row[13] || '').trim();
        if (partNum && desc && !titleByPart.has(partNum)) titleByPart.set(partNum, desc);
        if (partNum && r && !revByPart.has(partNum)) revByPart.set(partNum, r);
      }

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

        const isAssyRow = !no || String(no).trim() === '';

        if (isAssyRow) {
          if (childPart) {
            if (!drawingsMap.has(childPart)) {
              drawingsMap.set(childPart, {
                drawingNumber: childPart,
                title: description || titleByPart.get(childPart) || '',
                rev: rev || revByPart.get(childPart) || '',
                parts: [],
              });
            } else {
              // 자식 파트 행이 먼저 등장해 title이 빈 채로 생성된 경우 채워줌
              const existing = drawingsMap.get(childPart);
              if (!existing.title) existing.title = description || titleByPart.get(childPart) || '';
              if (!existing.rev) existing.rev = rev || revByPart.get(childPart) || '';
            }
          }
        } else {
          if (parentPart && !drawingsMap.has(parentPart)) {
            drawingsMap.set(parentPart, {
              drawingNumber: parentPart,
              title: titleByPart.get(parentPart) || '',
              rev: revByPart.get(parentPart) || '',
              parts: [],
            });
          }
          if (parentPart) {
            const d = drawingsMap.get(parentPart);
            const seqNum = parseInt(no) || null;
            // BOM 트리 전개 방식의 원본 Excel에서는 같은 도면이 여러 부모 경로에
            // 걸쳐 반복 출력되며, 중간 항목 하나가 생략되면 이후 NO.가 전부 밀린다.
            // 따라서 NO.가 아닌 자품번 단독으로 중복을 판정해야 한다
            // (같은 도면 안에 동일 부품이 두 번 등록될 이유가 없음).
            const isDuplicate = childPart && d.parts.some((p) => p.partNumber === childPart);
            if (!isDuplicate) {
              d.parts.push({
                seq: seqNum || d.parts.length + 1,
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
  const [showSavePoints, setShowSavePoints] = useState(false);
  const [jumpTarget, setJumpTarget] = useState(null); // { drawingId, nonce } — 사이드바에서 E-BOM으로 이동 요청

  function handleJumpToDrawing(drawingId) {
    if (!drawingId) return;
    setActiveTab('ebom');
    setJumpTarget((prev) => ({ drawingId, nonce: (prev?.nonce || 0) + 1 }));
  }
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

  // 최신 state를 ref로 유지해서 종료 핸들러 클로저에서도 최신값을 사용할 수 있게 함
  const latestStateRef = useRef(state);
  useEffect(() => { latestStateRef.current = state; }, [state]);

  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closingInProgress, setClosingInProgress] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  // Electron 종료 확인: 닫기 직전 저장/취소/저장 안 함 중 선택하게 한다.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onBeforeClose) return;
    api.onBeforeClose(() => setShowCloseConfirm(true));
    // electronAPI IPC 리스너는 등록 후 해제 API가 없으므로 cleanup 생략
  }, []);

  // 자동 업데이트: 새 버전이 백그라운드에 다운로드되면 배너로 안내
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateReady) return;
    api.onUpdateReady(() => setUpdateReady(true));
  }, []);

  function handleRestartToUpdate() {
    window.electronAPI?.restartToUpdate();
  }

  function handleSaveAndClose() {
    setClosingInProgress(true);
    // 디바운스 대기 없이 즉시 저장한 뒤 닫는다
    saveProject(latestStateRef.current)
      .catch((err) => console.error('종료 저장 실패:', err))
      .finally(() => window.electronAPI?.confirmClose());
  }

  function handleCloseWithoutSaving() {
    // 자동저장으로 이미 반영된 상태 그대로 닫는다 (직전 몇 초의 미저장 변경만 유실될 수 있음)
    window.electronAPI?.confirmClose();
  }

  function handleCancelClose() {
    setShowCloseConfirm(false);
    window.electronAPI?.cancelClose();
  }

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
        onOpenSavePoints={() => setShowSavePoints(true)}
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
            onJumpToDrawing={handleJumpToDrawing}
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
              jumpTarget={jumpTarget}
            />
          </div>

          <div className={`h-full ${activeTab === 'mbom' ? '' : 'hidden'}`}>
            <MBOMTable />
          </div>

          <div className={`h-full ${activeTab === 'history' ? '' : 'hidden'}`}>
            <HistoryTab />
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

      {showSavePoints && (
        <SavePointsModal onClose={() => setShowSavePoints(false)} />
      )}

      {showCloseConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="bg-blue-800 dark:bg-gray-900 text-white px-5 py-3">
              <p className="font-bold text-sm">프로그램을 닫으시겠습니까?</p>
            </div>
            <div className="p-5 space-y-2">
              <button
                onClick={handleSaveAndClose}
                disabled={closingInProgress}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors"
              >
                {closingInProgress ? '저장 중...' : '저장 후 닫기'}
              </button>
              <button
                onClick={handleCloseWithoutSaving}
                disabled={closingInProgress}
                className="w-full bg-red-50 hover:bg-red-100 dark:bg-red-950 dark:hover:bg-red-900 disabled:opacity-50 text-red-600 dark:text-red-400 font-medium py-2.5 rounded-lg text-sm border border-red-200 dark:border-red-800 transition-colors"
              >
                저장하지 않고 닫기
              </button>
              <button
                onClick={handleCancelClose}
                disabled={closingInProgress}
                className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-600 dark:text-gray-300 font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                취소
              </button>
              <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">
                자동저장이 주기적으로 동작하므로, "저장하지 않고 닫기"를 선택해도 직전 몇 초 내의 변경사항만 유실될 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {updateReady && (
        <div className="fixed bottom-4 right-4 z-[100] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-4 max-w-sm">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">🔄 새 버전이 준비되었습니다</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            백그라운드에서 업데이트를 이미 받아뒀습니다. 재시작하면 바로 적용됩니다.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleRestartToUpdate}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-1.5 rounded-lg text-sm transition-colors"
            >
              지금 재시작
            </button>
            <button
              onClick={() => setUpdateReady(false)}
              className="px-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 font-medium py-1.5 rounded-lg text-sm transition-colors"
            >
              나중에
            </button>
          </div>
        </div>
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
