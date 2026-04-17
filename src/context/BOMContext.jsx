import { createContext, useContext, useReducer, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { buildBOMRows, detectCircularReferences } from '../utils/bomMapper';
import { recalculate } from '../utils/calculations';
import { saveProject, loadProject } from '../utils/db';

const BOMContext = createContext(null);

function makeInitialState(projectMeta) {
  const now = new Date().toISOString();
  return {
    project: {
      id: projectMeta?.id || uuidv4(),
      name: projectMeta?.name || 'BOM 프로젝트',
      baseDate: projectMeta?.baseDate || '',
      totalQty: projectMeta?.totalQty ?? 33,
      createdAt: projectMeta?.createdAt || now,
      updatedAt: now,
    },
    drawings: [],
    bomRows: [],
    circularWarnings: [],
  };
}

function rebuild(drawings, totalQty) {
  const warnings = detectCircularReferences(drawings);
  const rows = buildBOMRows(drawings);
  const finalRows = recalculate(rows, totalQty);
  return { finalRows, warnings };
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_PROJECT': {
      const { drawings = [], project } = action.data;
      const { finalRows, warnings } = rebuild(drawings, project?.totalQty ?? 33);
      return { ...action.data, bomRows: finalRows, circularWarnings: warnings };
    }

    case 'SET_PROJECT_INFO': {
      const newProject = { ...state.project, ...action.payload };
      const finalRows = recalculate(state.bomRows, newProject.totalQty);
      return { ...state, project: newProject, bomRows: finalRows };
    }

    case 'ADD_DRAWING': {
      const drawing = action.drawing;
      const existingIndex = state.drawings.findIndex(
        (d) => d.drawingNumber === drawing.drawingNumber
      );
      const newDrawings =
        existingIndex >= 0
          ? state.drawings.map((d, i) =>
              i === existingIndex ? { ...drawing, id: d.id } : d
            )
          : [...state.drawings, drawing];
      const { finalRows, warnings } = rebuild(newDrawings, state.project.totalQty);
      return { ...state, drawings: newDrawings, bomRows: finalRows, circularWarnings: warnings };
    }

    case 'DELETE_DRAWING': {
      const newDrawings = state.drawings.filter((d) => d.id !== action.drawingId);
      const { finalRows, warnings } = rebuild(newDrawings, state.project.totalQty);
      return { ...state, drawings: newDrawings, bomRows: finalRows, circularWarnings: warnings };
    }

    case 'UPDATE_BOM_ROW': {
      const updated = state.bomRows.map((row) =>
        row.id === action.rowId ? { ...row, ...action.fields } : row
      );
      return { ...state, bomRows: recalculate(updated, state.project.totalQty) };
    }

    case 'CLEAR_CIRCULAR_WARNINGS':
      return { ...state, circularWarnings: [] };

    default:
      return state;
  }
}

// ── Provider ─────────────────────────────────────────────────

export function BOMProvider({ children, projectMeta }) {
  const [state, dispatch] = useReducer(reducer, makeInitialState(projectMeta));
  const [isLoading, setIsLoading] = useState(!!projectMeta?._load);

  // 기존 프로젝트 불러오기 (mount 시 1회)
  useEffect(() => {
    if (!projectMeta?._load) {
      setIsLoading(false);
      return;
    }
    const id = projectMeta.id;
    loadProject(id).then((data) => {
      if (data) {
        dispatch({ type: 'LOAD_PROJECT', data });
      }
      setIsLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 상태 변화 시 IndexedDB 자동 저장 (1.5초 디바운스)
  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      saveProject(state).catch((err) =>
        console.error('IndexedDB 저장 실패:', err)
      );
    }, 1500);
    return () => clearTimeout(timer);
  }, [state, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center text-gray-500">
          <p className="text-2xl mb-2 animate-pulse">⚙️</p>
          <p className="text-sm">프로젝트 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <BOMContext.Provider value={{ state, dispatch }}>
      {children}
    </BOMContext.Provider>
  );
}

export function useBOM() {
  const ctx = useContext(BOMContext);
  if (!ctx) throw new Error('useBOM must be used within BOMProvider');
  return ctx;
}
