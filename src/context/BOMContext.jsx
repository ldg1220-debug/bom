import { createContext, useContext, useReducer } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { buildBOMRows, detectCircularReferences } from '../utils/bomMapper';
import { recalculate } from '../utils/calculations';

const BOMContext = createContext(null);

const initialState = {
  project: {
    id: uuidv4(),
    name: 'BOM 프로젝트',
    baseDate: '',
    totalQty: 33,
  },
  drawings: [],
  bomRows: [],
  circularWarnings: [], // 순환 참조 경고 메시지 목록
};

function rebuild(drawings, totalQty) {
  const warnings = detectCircularReferences(drawings);
  const rows = buildBOMRows(drawings);
  const finalRows = recalculate(rows, totalQty);
  return { finalRows, warnings };
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_PROJECT_INFO': {
      const newProject = { ...state.project, ...action.payload };
      // totalQty 변경 시 소요량 재계산
      const finalRows = recalculate(state.bomRows, newProject.totalQty);
      return { ...state, project: newProject, bomRows: finalRows };
    }

    case 'ADD_DRAWING': {
      const drawing = action.drawing;
      const existingIndex = state.drawings.findIndex(
        (d) => d.drawingNumber === drawing.drawingNumber
      );
      let newDrawings;
      if (existingIndex >= 0) {
        // 기존 id 유지하면서 내용 덮어쓰기
        newDrawings = state.drawings.map((d, i) =>
          i === existingIndex ? { ...drawing, id: d.id } : d
        );
      } else {
        newDrawings = [...state.drawings, drawing];
      }
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
      const finalRows = recalculate(updated, state.project.totalQty);
      return { ...state, bomRows: finalRows };
    }

    case 'CLEAR_CIRCULAR_WARNINGS': {
      return { ...state, circularWarnings: [] };
    }

    case 'IMPORT_PROJECT': {
      return { ...initialState, ...action.project };
    }

    default:
      return state;
  }
}

export function BOMProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
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
