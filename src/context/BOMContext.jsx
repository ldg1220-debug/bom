import { createContext, useContext, useReducer } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { buildBOMRows } from '../utils/bomMapper';
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
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_PROJECT_INFO': {
      return {
        ...state,
        project: { ...state.project, ...action.payload },
      };
    }

    case 'ADD_DRAWING': {
      const drawing = action.drawing;
      const existingIndex = state.drawings.findIndex(
        (d) => d.drawingNumber === drawing.drawingNumber
      );
      let newDrawings;
      if (existingIndex >= 0) {
        newDrawings = state.drawings.map((d, i) =>
          i === existingIndex ? drawing : d
        );
      } else {
        newDrawings = [...state.drawings, drawing];
      }
      const newBomRows = buildBOMRows(newDrawings);
      const finalRows = recalculate(newBomRows, state.project.totalQty);
      return { ...state, drawings: newDrawings, bomRows: finalRows };
    }

    case 'DELETE_DRAWING': {
      const newDrawings = state.drawings.filter(
        (d) => d.id !== action.drawingId
      );
      const newBomRows = buildBOMRows(newDrawings);
      const finalRows = recalculate(newBomRows, state.project.totalQty);
      return { ...state, drawings: newDrawings, bomRows: finalRows };
    }

    case 'UPDATE_BOM_ROW': {
      const updated = state.bomRows.map((row) =>
        row.id === action.rowId ? { ...row, ...action.fields } : row
      );
      const finalRows = recalculate(updated, state.project.totalQty);
      return { ...state, bomRows: finalRows };
    }

    case 'RECALCULATE': {
      const finalRows = recalculate(state.bomRows, state.project.totalQty);
      return { ...state, bomRows: finalRows };
    }

    case 'IMPORT_PROJECT': {
      return { ...action.project };
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
