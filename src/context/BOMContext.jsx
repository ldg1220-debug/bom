import { createContext, useContext, useReducer, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { buildBOMRows, detectCircularReferences } from '../utils/bomMapper';
import { recalculate } from '../utils/calculations';
import { saveProject, loadProject, ensureDailyCheckpoint, pruneExpiredCheckpoints } from '../utils/db';

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
    purchaseUnits: new Set(),
    mbomOverrides: {},
    history: [],
  };
}

function applyRevisionDiff(existingParts, newParts) {
  const matchedNewIdx = new Set();
  const result = [];

  for (const ep of existingParts) {
    let ni = -1;
    if (ep.partNumber) {
      ni = newParts.findIndex((p, i) => !matchedNewIdx.has(i) && p.partNumber === ep.partNumber);
    }
    if (ni === -1) {
      ni = newParts.findIndex((p, i) => !matchedNewIdx.has(i) && !ep.partNumber && !p.partNumber && p.seq === ep.seq);
    }
    const np = ni >= 0 ? newParts[ni] : null;
    if (ni >= 0) matchedNewIdx.add(ni);

    if (!np) {
      result.push({ ...ep, qty: 0, _deletedInRev: true, specRemark: '삭제' });
    } else if (np.qty !== ep.qty) {
      result.push({
        ...ep,
        qty: np.qty,
        _qtyChangedFrom: ep.qty,
        _deletedInRev: false,
        specRemark: `수량변경 ${ep.qty}→${np.qty}`,
        description: np.description || ep.description,
        material: np.material || ep.material,
        unit: np.unit || ep.unit,
      });
    } else {
      result.push({
        ...ep,
        _deletedInRev: false,
        _qtyChangedFrom: null,
        description: np.description !== undefined ? np.description : ep.description,
        material: np.material !== undefined ? np.material : ep.material,
      });
    }
  }

  const maxSeq = existingParts.reduce((m, p) => Math.max(m, p.seq), 0);
  let seqOffset = maxSeq;
  newParts.forEach((np, i) => {
    if (!matchedNewIdx.has(i)) {
      result.push({ ...np, seq: ++seqOffset });
    }
  });

  return result;
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
      return {
        ...action.data,
        bomRows: finalRows,
        circularWarnings: warnings,
        purchaseUnits: new Set(action.data.purchaseUnits || []),
        mbomOverrides: action.data.mbomOverrides || {},
        history: action.data.history || [],
      };
    }

    case 'SET_PROJECT_INFO': {
      const newProject = { ...state.project, ...action.payload };
      const finalRows = recalculate(state.bomRows, newProject.totalQty);
      return { ...state, project: newProject, bomRows: finalRows };
    }

    case 'REPLACE_ALL_DRAWINGS': {
      const { finalRows, warnings } = rebuild(action.drawings, state.project.totalQty);
      return { ...state, drawings: action.drawings, bomRows: finalRows, circularWarnings: warnings };
    }

    case 'ADD_DRAWING': {
      const drawing = action.drawing;
      const existingIndex = state.drawings.findIndex(
        (d) => d.drawingNumber === drawing.drawingNumber
      );
      let historyEntry = null;
      let newDrawings;
      if (existingIndex >= 0) {
        const old = state.drawings[existingIndex];
        const oldByPN = new Map(old.parts.map((p) => [p.partNumber, p]));
        const newByPN = new Map(drawing.parts.map((p) => [p.partNumber, p]));
        const added = [], removed = [], changed = [];
        for (const [pn, p] of newByPN) {
          if (!oldByPN.has(pn)) {
            added.push({ seq: p.seq, partNumber: p.partNumber, description: p.description });
          } else {
            const op = oldByPN.get(pn);
            if (op.qty !== p.qty) {
              changed.push({ seq: p.seq, partNumber: p.partNumber, description: p.description, qtyFrom: op.qty, qtyTo: p.qty });
            }
          }
        }
        for (const [pn, p] of oldByPN) {
          if (!newByPN.has(pn)) removed.push({ seq: p.seq, partNumber: p.partNumber, description: p.description });
        }
        const revChanged = old.rev !== drawing.rev;
        if (revChanged || added.length || removed.length || changed.length) {
          historyEntry = {
            id: uuidv4(),
            date: new Date().toISOString(),
            drawingId: old.id,
            drawingNumber: old.drawingNumber,
            type: 'revision',
            oldRev: old.rev,
            newRev: drawing.rev,
            added, removed, changed,
            partCountBefore: old.parts.length,
            partCountAfter: drawing.parts.length,
          };
        }
        newDrawings = state.drawings.map((d, i) => (i === existingIndex ? { ...drawing, id: d.id } : d));
      } else {
        newDrawings = [...state.drawings, drawing];
      }
      const { finalRows, warnings } = rebuild(newDrawings, state.project.totalQty);
      return {
        ...state, drawings: newDrawings, bomRows: finalRows, circularWarnings: warnings,
        history: historyEntry ? [...state.history, historyEntry] : state.history,
      };
    }

    case 'DELETE_DRAWING': {
      const newDrawings = state.drawings.filter((d) => d.id !== action.drawingId);
      const { finalRows, warnings } = rebuild(newDrawings, state.project.totalQty);
      // 삭제된 도면의 구매단위 키 정리
      const prefix = `${action.drawingId}:`;
      const newPU = new Set([...state.purchaseUnits].filter((k) => !k.startsWith(prefix)));
      return { ...state, drawings: newDrawings, bomRows: finalRows, circularWarnings: warnings, purchaseUnits: newPU };
    }

    case 'SET_PURCHASE_UNITS_RANGE': {
      const next = new Set(state.purchaseUnits);
      for (const key of action.keys) { action.value ? next.add(key) : next.delete(key); }
      return { ...state, purchaseUnits: next };
    }

    case 'UPDATE_BOM_ROW': {
      const updated = state.bomRows.map((row) =>
        row.id === action.rowId ? { ...row, ...action.fields } : row
      );
      return { ...state, bomRows: recalculate(updated, state.project.totalQty) };
    }

    // 같은 부모 도면 내에서 파트 순서 변경 (드래그 정렬)
    case 'REORDER_PART': {
      const { drawingId, fromSeq, toSeq } = action;
      if (!drawingId || fromSeq === toSeq) return state;

      const newDrawings = state.drawings.map((d) => {
        if (d.id !== drawingId) return d;
        const fromIdx = d.parts.findIndex((p) => p.seq === fromSeq);
        const toIdx = d.parts.findIndex((p) => p.seq === toSeq);
        if (fromIdx === -1 || toIdx === -1) return d;

        const newParts = [...d.parts];
        const [moved] = newParts.splice(fromIdx, 1);
        newParts.splice(toIdx, 0, moved);
        return { ...d, parts: newParts.map((p, i) => ({ ...p, seq: i + 1 })) };
      });

      const { finalRows, warnings } = rebuild(newDrawings, state.project.totalQty);
      return { ...state, drawings: newDrawings, bomRows: finalRows, circularWarnings: warnings };
    }

    // 파트의 부품번호를 다른 도면번호로 수동 연결 (_noChild 플래그 초기화)
    case 'LINK_PART_TO_DRAWING': {
      const { drawingId, partSeq, targetDrawingNumber } = action;
      const newDrawings = state.drawings.map((d) => {
        if (d.id !== drawingId) return d;
        return {
          ...d,
          parts: d.parts.map((p) => {
            if (p.seq !== partSeq) return p;
            const { _noChild, ...rest } = p;
            return { ...rest, partNumber: targetDrawingNumber };
          }),
        };
      });
      const { finalRows, warnings } = rebuild(newDrawings, state.project.totalQty);
      return { ...state, drawings: newDrawings, bomRows: finalRows, circularWarnings: warnings };
    }

    // 하위 도면 연결 해제 (_noChild = true 설정)
    case 'UNLINK_PART': {
      const { drawingId, partSeq } = action;
      const newDrawings = state.drawings.map((d) => {
        if (d.id !== drawingId) return d;
        return {
          ...d,
          parts: d.parts.map((p) =>
            p.seq === partSeq ? { ...p, _noChild: true } : p
          ),
        };
      });
      const { finalRows, warnings } = rebuild(newDrawings, state.project.totalQty);
      return { ...state, drawings: newDrawings, bomRows: finalRows, circularWarnings: warnings };
    }

    // 선택된 파트 행 삭제 (rowInfos: [{drawingId, partSeq}])
    case 'DELETE_BOM_PART_ROWS': {
      const toDelete = new Map();
      for (const { drawingId, partSeq } of action.rowInfos) {
        if (!toDelete.has(drawingId)) toDelete.set(drawingId, new Set());
        toDelete.get(drawingId).add(partSeq);
      }
      const newDrawings = state.drawings.map((d) => {
        const seqs = toDelete.get(d.id);
        if (!seqs) return d;
        return { ...d, parts: d.parts.filter((p) => !seqs.has(p.seq)) };
      });
      const { finalRows, warnings } = rebuild(newDrawings, state.project.totalQty);
      return { ...state, drawings: newDrawings, bomRows: finalRows, circularWarnings: warnings };
    }

    // M-BOM 셀 직접 편집 오버라이드
    case 'UPDATE_MBOM_OVERRIDE': {
      const { childPart, fields } = action;
      return {
        ...state,
        mbomOverrides: {
          ...(state.mbomOverrides || {}),
          [childPart]: { ...(state.mbomOverrides?.[childPart] || {}), ...fields },
        },
      };
    }

    case 'UPDATE_DRAWING_PART': {
      const { drawingId, isAssyRow, partSeq, fields } = action;
      const newDrawings = state.drawings.map((d) => {
        if (d.id !== drawingId) return d;
        if (isAssyRow) {
          const up = {};
          if ('description' in fields) up.title = fields.description;
          if ('rev' in fields) up.rev = fields.rev;
          return { ...d, ...up };
        }
        return {
          ...d,
          parts: d.parts.map((p) => {
            if (p.seq !== partSeq) return p;
            const up = {};
            if ('description' in fields) up.description = fields.description;
            if ('material' in fields) up.material = fields.material;
            if ('unitQty' in fields) up.qty = Number(fields.unitQty) || p.qty;
            if ('vendor' in fields) up.vendor = fields.vendor;
            if ('staNo' in fields) up.staNo = fields.staNo;
            if ('processType' in fields) up.processType = fields.processType;
            if ('spec' in fields) up.spec = fields.spec;
            if ('partNumber' in fields) up.partNumber = String(fields.partNumber || '').trim();
            return { ...p, ...up };
          }),
        };
      });
      const { finalRows, warnings } = rebuild(newDrawings, state.project.totalQty);
      return { ...state, drawings: newDrawings, bomRows: finalRows, circularWarnings: warnings };
    }

    // 도면번호(자품번) 자체를 오타 수정 등으로 변경. 다른 도면이 이 도면을
    // 하위 부품으로 참조 중이면 그 참조도 함께 갱신해 연결이 끊기지 않도록 한다.
    case 'RENAME_DRAWING_NUMBER': {
      const { drawingId, newDrawingNumber } = action;
      const trimmed = String(newDrawingNumber || '').trim();
      const target = state.drawings.find((d) => d.id === drawingId);
      if (!target || !trimmed || target.drawingNumber === trimmed) return state;
      if (state.drawings.some((d) => d.id !== drawingId && d.drawingNumber === trimmed)) return state;

      const oldNumber = target.drawingNumber;
      const newDrawings = state.drawings.map((d) => {
        if (d.id === drawingId) return { ...d, drawingNumber: trimmed };
        if (!d.parts.some((p) => p.partNumber === oldNumber)) return d;
        return {
          ...d,
          parts: d.parts.map((p) => (p.partNumber === oldNumber ? { ...p, partNumber: trimmed } : p)),
        };
      });
      const { finalRows, warnings } = rebuild(newDrawings, state.project.totalQty);
      return { ...state, drawings: newDrawings, bomRows: finalRows, circularWarnings: warnings };
    }

    // 도면 복제: 좌/우 대칭 부품(예: -L/-R)처럼 파트 구성이 동일한 도면을
    // 새 도면번호로 복사해 등록. 파트 목록은 그대로 복사되고 독립적으로 편집 가능.
    case 'DUPLICATE_DRAWING': {
      const { sourceDrawingId, newDrawingNumber } = action;
      const trimmed = String(newDrawingNumber || '').trim();
      const source = state.drawings.find((d) => d.id === sourceDrawingId);
      if (!source || !trimmed) return state;
      if (state.drawings.some((d) => d.drawingNumber === trimmed)) return state;

      const now = new Date().toISOString();
      const duplicated = {
        ...source,
        id: uuidv4(),
        drawingNumber: trimmed,
        parts: source.parts.map((p) => ({ ...p })),
        createdAt: now,
        updatedAt: now,
      };
      const newDrawings = [...state.drawings, duplicated];
      const { finalRows, warnings } = rebuild(newDrawings, state.project.totalQty);
      return { ...state, drawings: newDrawings, bomRows: finalRows, circularWarnings: warnings };
    }

    case 'APPLY_REVISION': {
      const { drawingId, newParts, newRev, newTitle } = action;
      let historyEntry = null;
      const newDrawings = state.drawings.map((d) => {
        if (d.id !== drawingId) return d;
        const merged = applyRevisionDiff(d.parts, newParts);
        const oldSeqSet = new Set(d.parts.map((p) => p.seq));
        const wasDeletedSeqSet = new Set(d.parts.filter((p) => p._deletedInRev).map((p) => p.seq));
        const added = [], removed = [], changed = [];
        for (const p of merged) {
          if (!oldSeqSet.has(p.seq)) {
            added.push({ seq: p.seq, partNumber: p.partNumber, description: p.description });
          } else if (p._deletedInRev && !wasDeletedSeqSet.has(p.seq)) {
            removed.push({ seq: p.seq, partNumber: p.partNumber, description: p.description });
          } else if (p._qtyChangedFrom != null) {
            changed.push({ seq: p.seq, partNumber: p.partNumber, description: p.description, qtyFrom: p._qtyChangedFrom, qtyTo: p.qty });
          }
        }
        const now = new Date().toISOString();
        const resolvedRev = newRev ? newRev : d.rev;
        historyEntry = {
          id: uuidv4(),
          date: now,
          drawingId: d.id,
          drawingNumber: d.drawingNumber,
          type: 'revision',
          oldRev: d.rev,
          newRev: resolvedRev,
          added, removed, changed,
          partCountBefore: d.parts.filter((p) => !p._deletedInRev).length,
          partCountAfter: merged.filter((p) => !p._deletedInRev).length,
        };
        return { ...d, parts: merged, rev: resolvedRev, title: newTitle || d.title, updatedAt: now };
      });
      const { finalRows, warnings } = rebuild(newDrawings, state.project.totalQty);
      return {
        ...state, drawings: newDrawings, bomRows: finalRows, circularWarnings: warnings,
        history: historyEntry ? [...state.history, historyEntry] : state.history,
      };
    }

    case 'APPEND_PARTS_TO_DRAWING': {
      const { drawingId, newParts } = action;
      let historyEntry = null;
      const newDrawings = state.drawings.map((d) => {
        if (d.id !== drawingId) return d;
        const maxSeq = d.parts.reduce((m, p) => Math.max(m, p.seq), 0);
        const appended = newParts.map((p, i) => ({ ...p, seq: maxSeq + i + 1 }));
        const now = new Date().toISOString();
        historyEntry = {
          id: uuidv4(),
          date: now,
          drawingId: d.id,
          drawingNumber: d.drawingNumber,
          type: 'append',
          oldRev: d.rev,
          newRev: d.rev,
          added: appended.map((p) => ({ seq: p.seq, partNumber: p.partNumber, description: p.description })),
          removed: [],
          changed: [],
          partCountBefore: d.parts.filter((p) => !p._deletedInRev).length,
          partCountAfter: d.parts.filter((p) => !p._deletedInRev).length + appended.length,
        };
        return { ...d, parts: [...d.parts, ...appended], updatedAt: now };
      });
      const { finalRows, warnings } = rebuild(newDrawings, state.project.totalQty);
      return {
        ...state, drawings: newDrawings, bomRows: finalRows, circularWarnings: warnings,
        history: historyEntry ? [...state.history, historyEntry] : state.history,
      };
    }

    case 'CLEAR_CIRCULAR_WARNINGS':
      return { ...state, circularWarnings: [] };

    default:
      return state;
  }
}

// ── Provider ──────────────────────────────────────────────────

export function BOMProvider({ children, projectMeta }) {
  const [state, dispatch] = useReducer(reducer, makeInitialState(projectMeta));
  const [isLoading, setIsLoading] = useState(!!projectMeta?._load);

  useEffect(() => {
    if (!projectMeta?._load) { setIsLoading(false); return; }
    loadProject(projectMeta.id).then((data) => {
      if (data) dispatch({ type: 'LOAD_PROJECT', data });
      setIsLoading(false);
      pruneExpiredCheckpoints(projectMeta.id).catch(() => {});
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 자동 저장 (1.5초 디바운스). 저장 직전, 오늘자 세이브 포인트가 없으면
  // "오늘 수정이 반영되기 전" 상태를 먼저 보관해 둔다 (48시간 후 자동 삭제).
  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      ensureDailyCheckpoint(state.project.id)
        .catch((err) => console.error('세이브 포인트 생성 실패:', err))
        .finally(() => {
          saveProject(state).catch((err) => console.error('저장 실패:', err));
        });
    }, 1500);
    return () => clearTimeout(timer);
  }, [state, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
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
