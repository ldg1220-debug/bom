import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useBOM } from '../context/BOMContext';
import DrawingUpload from './DrawingUpload';

function formatRelativeDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff < 7) return `${diff}일 전`;
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function DrawingCombobox({ drawings, value, onChange, accentColor = 'orange' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const sorted = [...drawings].sort(
    (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
  );
  const filtered = sorted.filter(
    (d) =>
      !query ||
      d.drawingNumber.toLowerCase().includes(query.toLowerCase()) ||
      (d.title || '').toLowerCase().includes(query.toLowerCase())
  );
  const selected = drawings.find((d) => d.id === value);

  useEffect(() => {
    function handleOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const borderCls = accentColor === 'purple'
    ? 'border-purple-300 focus-within:border-purple-500'
    : 'border-orange-300 focus-within:border-orange-500';
  const itemHoverCls = accentColor === 'purple' ? 'hover:bg-purple-50' : 'hover:bg-orange-50';
  const labelCls = accentColor === 'purple' ? 'text-purple-700' : 'text-orange-700';

  return (
    <div ref={boxRef} className="relative">
      <div className={`flex items-center border rounded overflow-hidden bg-white ${borderCls}`}>
        <input
          className="flex-1 px-2 py-1.5 text-sm focus:outline-none"
          placeholder="도면번호 또는 제목 검색..."
          value={open ? query : (selected ? `${selected.drawingNumber}${selected.title ? ' · ' + selected.title : ''}` : '')}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); onChange(''); }}
        />
        {selected && !open && (
          <button
            className="px-2 text-gray-400 hover:text-gray-600 text-sm"
            onMouseDown={(e) => { e.preventDefault(); onChange(''); }}
          >✕</button>
        )}
        <span className="px-2 text-gray-400 text-xs pointer-events-none">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">일치하는 도면 없음</p>
          ) : (
            filtered.map((d, i) => (
              <button
                key={d.id}
                onMouseDown={() => { onChange(d.id); setQuery(''); setOpen(false); }}
                className={`w-full text-left px-3 py-2 border-b border-gray-100 last:border-0 ${itemHoverCls}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-mono font-semibold ${labelCls}`}>{d.drawingNumber}</span>
                  <div className="flex items-center gap-2">
                    {i === 0 && <span className="text-xs text-blue-500 font-medium">최근</span>}
                    <span className="text-xs text-gray-400">{d.parts.length}파트</span>
                    <span className="text-xs text-gray-400">{formatRelativeDate(d.updatedAt)}</span>
                  </div>
                </div>
                {d.title && <p className="text-xs text-gray-500 truncate mt-0.5">{d.title}</p>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const EMPTY_PART = (seq = 1) => ({
  id: uuidv4(),
  seq,
  partNumber: '',
  description: '',
  material: '',
  qty: 1,
  unit: 'EA',
  specRemark: '',
});

export default function OCREditor({ onDrawingAdded, editDrawing, onEditCancel }) {
  const { state, dispatch } = useBOM();
  const { drawings } = state;

  const [drawingNumber, setDrawingNumber] = useState('');
  const [title, setTitle] = useState('');
  const [rev, setRev] = useState('');
  const [parts, setParts] = useState([EMPTY_PART()]);
  const [rawText, setRawText] = useState('');
  const [checkedPartIds, setCheckedPartIds] = useState(new Set());
  const [targetDrawingId, setTargetDrawingId] = useState('');
  const [mergeChoice, setMergeChoice] = useState(null); // { existing, validParts, newRevInput } — REV 동일/미지정 시 3택 모달
  const isEditMode = !!editDrawing;

  const uploadRef = useRef(null);

  useEffect(() => {
    if (editDrawing) {
      setTargetDrawingId('');
      setDrawingNumber(editDrawing.drawingNumber || '');
      setTitle(editDrawing.title || '');
      setRev(editDrawing.rev || '');
      setRawText(editDrawing.rawOcr || '');
      setParts(
        editDrawing.parts.length > 0
          ? [...editDrawing.parts]
              .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0))
              .map((p) => ({ ...p, id: uuidv4() }))
          : [EMPTY_PART()]
      );
    }
  }, [editDrawing]);

  function handleOCRComplete(parsed) {
    const newDrawingNumber = (parsed.drawingNumber || '').trim();
    const currentDrawingNumber = drawingNumber.trim();
    // 폼에 남아있는 도면번호와 새로 인식된 도면번호가 다르면, 이전 내용은
    // 다른(이미 제거됐거나 무관한) 도면의 잔여 데이터이므로 이어붙이지 않고 교체한다.
    // (같은 도면을 여러 스크린샷으로 나눠 연속 스캔하는 경우엔 도면번호가 그대로이므로
    // 아래의 이어붙이기 경로를 그대로 탄다)
    const isDifferentDrawing = !!currentDrawingNumber && !!newDrawingNumber && currentDrawingNumber !== newDrawingNumber;

    if (parsed.drawingNumber) setDrawingNumber(parsed.drawingNumber);
    if (parsed.title) setTitle(parsed.title);
    if (parsed.rev) setRev(parsed.rev);

    if (isDifferentDrawing) {
      setRawText(parsed.rawText || '');
      setParts(
        parsed.parts && parsed.parts.length > 0
          ? parsed.parts.map((p) => ({ ...p, id: uuidv4() }))
          : [EMPTY_PART()]
      );
      return;
    }

    setRawText((prev) => prev ? prev + '\n\n---\n\n' + (parsed.rawText || '') : (parsed.rawText || ''));

    if (parsed.parts && parsed.parts.length > 0) {
      const newParsed = parsed.parts.map((p) => ({ ...p, id: uuidv4() }));
      setParts((prev) => {
        const hasValid = prev.some((p) => p.partNumber || p.description);
        if (!hasValid) return newParsed;
        // 이미 파트가 있으면 seq 기준으로 이어붙이기 (중복 seq 제외)
        const existingSeqs = new Set(prev.map((p) => String(p.seq)));
        const toAdd = newParsed.filter((p) => !existingSeqs.has(String(p.seq)));
        return [...prev, ...toAdd].sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
      });
    }
  }

  function updatePart(id, field, value) {
    setParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  }

  function addRow() {
    setParts((prev) => {
      const maxSeq = prev.reduce((m, p) => Math.max(m, Number(p.seq) || 0), 0);
      return [...prev, EMPTY_PART(maxSeq + 1)];
    });
  }

  function deleteRow(id) {
    setParts((prev) => {
      const next = prev.filter((p) => p.id !== id);
      return next.length > 0 ? next : [EMPTY_PART()];
    });
    setCheckedPartIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function togglePartChecked(id) {
    setCheckedPartIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllChecked() {
    setCheckedPartIds((prev) => {
      const allChecked = parts.length > 0 && parts.every((p) => prev.has(p.id));
      return allChecked ? new Set() : new Set(parts.map((p) => p.id));
    });
  }

  function deleteCheckedRows() {
    if (checkedPartIds.size === 0) return;
    setParts((prev) => {
      const next = prev.filter((p) => !checkedPartIds.has(p.id));
      return next.length > 0 ? next : [EMPTY_PART()];
    });
    setCheckedPartIds(new Set());
  }

  function handleKeyDown(e, rowIndex, colIndex, totalCols) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const nextCol = colIndex + 1;
      const nextRow = rowIndex + (nextCol >= totalCols ? 1 : 0);
      const nextColActual = nextCol % totalCols;
      const el = document.querySelector(`[data-row="${nextRow}"][data-col="${nextColActual}"]`);
      if (el) {
        el.focus();
      } else if (nextRow >= parts.length) {
        addRow();
        setTimeout(() => {
          const newEl = document.querySelector(`[data-row="${nextRow}"][data-col="0"]`);
          if (newEl) newEl.focus();
        }, 50);
      }
    }
  }

  function resetForm() {
    setDrawingNumber('');
    setTitle('');
    setRev('');
    setParts([EMPTY_PART()]);
    setRawText('');
    setCheckedPartIds(new Set());
    setTargetDrawingId('');
  }

  function addToBOM() {
    const validParts = parts
      .filter((p) => p.partNumber || p.description)
      .map((p, i) => ({
        seq: Number(p.seq) || i + 1,
        partNumber: (p.partNumber || '').trim(),
        description: (p.description || '').trim(),
        material: (p.material || '').trim(),
        qty: parseFloat(p.qty) || 1,
        unit: (p.unit || 'EA').trim(),
        specRemark: (p.specRemark || '').trim(),
      }));

    // 중복 자품번 검사
    const pnCount = {};
    for (const p of validParts) {
      if (p.partNumber) pnCount[p.partNumber] = (pnCount[p.partNumber] || 0) + 1;
    }
    const dupParts = Object.keys(pnCount).filter((k) => pnCount[k] > 1);
    if (dupParts.length > 0) {
      const choice = window.confirm(
        `⚠️ 중복된 자품번이 ${dupParts.length}개 있습니다:\n${dupParts.slice(0, 5).join('\n')}${dupParts.length > 5 ? `\n...외 ${dupParts.length - 5}개` : ''}\n\n[확인] 중복 제거 (seq 기준 첫 번째만 유지)\n[취소] 중복 포함 그대로 저장`
      );
      if (choice) {
        const seen = new Set();
        const deduped = validParts.filter((p) => {
          if (!p.partNumber) return true;
          if (seen.has(p.partNumber)) return false;
          seen.add(p.partNumber);
          return true;
        });
        validParts.length = 0;
        validParts.push(...deduped);
      }
    }

    const trimmed = drawingNumber.trim();

    // 도면번호 미인식(분할 스크린샷 등) → 수동 선택한 도면에 이어 붙이기
    if (!trimmed && !isEditMode) {
      if (!targetDrawingId) { alert('도면번호를 입력하거나, 이어 붙일 도면을 선택하세요.'); return; }
      if (validParts.length === 0) { alert('추가할 파트가 없습니다.'); return; }
      dispatch({ type: 'APPEND_PARTS_TO_DRAWING', drawingId: targetDrawingId, newParts: validParts });
      onDrawingAdded && onDrawingAdded();
      resetForm();
      uploadRef.current?.clear();
      return;
    }

    if (!trimmed) { alert('도면번호를 입력하세요.'); return; }

    const existing = drawings.find((d) => d.drawingNumber === trimmed);

    if (existing && !isEditMode) {
      const existingRev = (existing.rev || '').trim();
      const newRevInput = rev.trim();
      const revChanged = newRevInput && existingRev && newRevInput !== existingRev;

      if (revChanged) {
        const ok = confirm(
          `"${trimmed}" 도면의 리비전을 교체합니다.\n` +
          `• REV: ${existingRev} → ${newRevInput}\n` +
          `• 삭제된 파트: 취소선 표시 + 비고 "삭제"\n` +
          `• 수량 변경: 빨간 숫자 + 비고 "수량변경 X→Y"\n` +
          `이 변경 내용은 수정이력에 기록됩니다.\n` +
          `계속하시겠습니까?`
        );
        if (!ok) return;
        if (validParts.length === 0) { alert('새 리비전 파트가 없습니다.'); return; }
        dispatch({ type: 'APPLY_REVISION', drawingId: existing.id, newParts: validParts, newRev: newRevInput });
        onDrawingAdded && onDrawingAdded();
        resetForm();
        uploadRef.current?.clear();
        return;
      }

      // REV가 같거나 비어있음 → 이어 붙이기 / 전체 교체 / 취소 중 하나를 모달로 선택
      if (validParts.length === 0) { alert('파트가 없습니다.'); return; }
      setMergeChoice({ existing, validParts, newRevInput });
      return;
    }

    // 수정 모드(재등록): 완전 교체(ADD_DRAWING) 대신 리비전 적용(APPLY_REVISION)을 사용해
    // 더 이상 참조되지 않는 파트(하위 도면 포함)를 취소선으로 보존하고, 그 하위 도면이
    // 부모 연결을 잃고 독립 루트로 떠버리는 일이 없도록 한다.
    if (isEditMode) {
      if (validParts.length === 0) { alert('파트가 없습니다.'); return; }
      dispatch({
        type: 'APPLY_REVISION',
        drawingId: editDrawing.id,
        newParts: validParts,
        newRev: rev.trim(),
        newTitle: title.trim(),
      });
      onDrawingAdded && onDrawingAdded();
      resetForm();
      uploadRef.current?.clear();
      onEditCancel && onEditCancel();
      return;
    }

    // 신규 도면
    const newId = uuidv4();
    dispatch({
      type: 'ADD_DRAWING',
      drawing: {
        id: newId,
        drawingNumber: trimmed,
        title: title.trim(),
        rev: rev.trim(),
        parts: validParts,
        rawOcr: rawText,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    onDrawingAdded && onDrawingAdded();
    resetForm();
    uploadRef.current?.clear();

    // 좌/우 대칭 부품처럼 같은 내용을 다른 도면번호로도 등록해야 하는 경우를 위한 안내
    // (필요 없으면 그냥 취소하면 되므로 등록 흐름을 막지 않음)
    if (confirm(
      `"${trimmed}" 도면을 등록했습니다.\n\n` +
      `좌/우 대칭 부품처럼 같은 파트 목록을 다른 도면번호로도 등록해야 하나요?\n` +
      `[확인] 다른 도면번호로 복제 등록  [취소] 완료`
    )) {
      const input = prompt('새 도면번호를 입력하세요 (예: 기존 번호 뒤에 -L / -R):', `${trimmed}-`);
      const newNum = (input || '').trim();
      if (newNum) {
        if (drawings.some((d) => d.drawingNumber === newNum)) {
          alert(`"${newNum}" 도면번호는 이미 사용 중입니다.`);
        } else {
          dispatch({ type: 'DUPLICATE_DRAWING', sourceDrawingId: newId, newDrawingNumber: newNum });
        }
      }
    }
  }

  function handleMergeAppend() {
    const { existing, validParts } = mergeChoice;
    dispatch({ type: 'APPEND_PARTS_TO_DRAWING', drawingId: existing.id, newParts: validParts });
    setMergeChoice(null);
    onDrawingAdded && onDrawingAdded();
    resetForm();
    uploadRef.current?.clear();
  }

  function handleMergeOverwrite() {
    const { existing, validParts, newRevInput } = mergeChoice;
    dispatch({ type: 'APPLY_REVISION', drawingId: existing.id, newParts: validParts, newRev: newRevInput });
    setMergeChoice(null);
    onDrawingAdded && onDrawingAdded();
    resetForm();
    uploadRef.current?.clear();
  }

  function handleMergeCancel() {
    setMergeChoice(null);
  }

  const [showRaw, setShowRaw] = useState(false);

  const trimmedDrawingNumber = drawingNumber.trim();
  const matchedDrawing = useMemo(
    () => drawings.find((d) => d.drawingNumber === trimmedDrawingNumber) || null,
    [drawings, trimmedDrawingNumber]
  );

  // 중복 자품번 계산 (시각적 표시용)
  const dupPartNums = useMemo(() => {
    const count = {};
    for (const p of parts) {
      if (p.partNumber) count[p.partNumber] = (count[p.partNumber] || 0) + 1;
    }
    return new Set(Object.keys(count).filter((k) => count[k] > 1));
  }, [parts]);

  const checkedCount = useMemo(() => parts.filter((p) => checkedPartIds.has(p.id)).length, [parts, checkedPartIds]);
  const allChecked = parts.length > 0 && checkedCount === parts.length;

  const COLS = ['seq', 'partNumber', 'description', 'material', 'qty', 'unit', 'specRemark'];
  const COL_LABELS = ['No', 'PART NO.', '품명', '재질', '수량', '단위', 'SPEC & REMARK'];
  const COL_WIDTHS = ['w-12', 'w-40', 'w-44', 'w-28', 'w-14', 'w-16', 'w-36'];

  return (
    <div className="flex flex-col gap-3">
      {/* ── 도면 정보 + 이미지 ── */}
      <div className="flex flex-col gap-3">
        {/* 재등록 모드 배너 */}
        {isEditMode && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-800">
                수정 모드: {editDrawing.drawingNumber}
              </p>
              <p className="text-xs text-amber-600">내용을 수정 후 [BOM에 저장]을 누르세요.</p>
            </div>
            <button
              onClick={() => { resetForm(); onEditCancel && onEditCancel(); }}
              className="text-amber-500 hover:text-amber-700 text-sm"
            >
              ✕ 취소
            </button>
          </div>
        )}

        {/* 이미지 업로드 */}
        <DrawingUpload ref={uploadRef} onOCRComplete={handleOCRComplete} />

        {/* 도면 정보 */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">도면 정보</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">도면번호 *</label>
              <input
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-blue-500"
                value={drawingNumber}
                onChange={(e) => setDrawingNumber(e.target.value)}
                placeholder="예: RM-LC01-FC23344"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">도면 제목</label>
              <input
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: FRONT PANEL, WELDED"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">REV</label>
              <input
                className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                value={rev}
                onChange={(e) => setRev(e.target.value)}
                placeholder="A"
              />
            </div>
          </div>
          {!isEditMode && matchedDrawing && (
            <p className="text-xs text-amber-600 mt-2">
              ⓘ 이미 등록된 도면입니다 (REV {matchedDrawing.rev || '—'} · 파트 {matchedDrawing.parts.length}개). [BOM에 추가]를 누르면 REV가 다를 때는 리비전 교체로, 같으면 이어 붙이기/전체 교체 중 선택하게 됩니다.
            </p>
          )}
        </div>

        {/* 도면번호 미인식 시 폴백: 수동으로 이어 붙일 도면 선택 */}
        {!isEditMode && !trimmedDrawingNumber && drawings.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h3 className="text-sm font-bold text-orange-700 mb-1">도면번호가 비어있습니다</h3>
            <p className="text-xs text-orange-500 mb-3">
              도면번호가 없는 분할 스크린샷이라면, 이어 붙일 도면을 직접 선택하세요. (선택 시 입력한 파트가 해당 도면에 추가됩니다)
            </p>
            <DrawingCombobox drawings={drawings} value={targetDrawingId} onChange={setTargetDrawingId} accentColor="orange" />
          </div>
        )}
      </div>

      {/* ── 파트리스트 + 버튼 ── */}
      <div className="flex flex-col gap-3">
        {/* 파트리스트 편집 테이블 */}
        <div className="bg-white border border-gray-200 rounded-lg flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-700">
                파트리스트{' '}
                <span className="text-gray-400 font-normal">({parts.filter(p => p.partNumber || p.description).length}개)</span>
              </h3>
              {dupPartNums.size > 0 && (
                <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 px-2 py-0.5 rounded-full font-medium">
                  ⚠ 중복 자품번 {dupPartNums.size}개
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">Tab 키로 다음 셀 이동</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="w-7 px-1 py-2 border-b border-gray-200">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAllChecked}
                      title="전체 선택 / 전체 해제"
                    />
                  </th>
                  {COL_LABELS.map((label, i) => (
                    <th
                      key={i}
                      className={`${COL_WIDTHS[i]} px-2 py-2 text-left font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap`}
                    >
                      {label}
                    </th>
                  ))}
                  <th className="w-8 border-b border-gray-200" />
                </tr>
              </thead>
              <tbody>
                {parts.map((part, rowIdx) => {
                  const isDup = !!(part.partNumber && dupPartNums.has(part.partNumber));
                  return (
                  <tr key={part.id} className={`border-b border-gray-100 hover:bg-blue-50 ${isDup ? 'bg-yellow-50' : ''}`}>
                    <td className="px-1 py-0.5 text-center">
                      <input
                        type="checkbox"
                        checked={checkedPartIds.has(part.id)}
                        onChange={() => togglePartChecked(part.id)}
                      />
                    </td>
                    {COLS.map((col, colIdx) => (
                      <td key={col} className="px-1 py-0.5">
                        <input
                          data-row={rowIdx}
                          data-col={colIdx}
                          className={`w-full border border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none rounded px-1 py-0.5 bg-transparent focus:bg-white text-xs ${
                            col === 'seq' ? 'text-center' : ''
                          } ${isDup && col === 'partNumber' ? 'text-yellow-700 font-semibold' : ''}`}
                          value={part[col] ?? ''}
                          onChange={(e) => updatePart(part.id, col, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx, COLS.length)}
                          type={col === 'seq' || col === 'qty' ? 'number' : 'text'}
                          min={col === 'qty' ? 0 : undefined}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-0.5 text-center">
                      <button
                        onClick={() => deleteRow(part.id)}
                        className="text-red-400 hover:text-red-600 text-xs"
                        title="행 삭제"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 border-t border-gray-200 shrink-0 flex items-center justify-between">
            <button
              onClick={addRow}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              + 행 추가
            </button>
            <div className="flex items-center gap-3">
              {checkedCount > 0 && (
                <button
                  onClick={deleteCheckedRows}
                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                  title="체크된 행 삭제"
                >
                  체크 삭제 ({checkedCount})
                </button>
              )}
              <button
                onClick={() => setParts([EMPTY_PART()])}
                className="text-xs text-red-400 hover:text-red-600"
                title="파트리스트 전체 초기화"
              >
                파트 초기화
              </button>
            </div>
          </div>
        </div>

        {/* Raw OCR 텍스트 */}
        {rawText && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden shrink-0">
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="w-full px-4 py-2 text-xs text-gray-500 flex items-center justify-between hover:bg-gray-100"
            >
              <span>🔍 Raw OCR 텍스트 (파싱 확인용)</span>
              <span>{showRaw ? '▲ 접기' : '▼ 펼치기'}</span>
            </button>
            {showRaw && (
              <pre className="px-4 py-3 text-xs text-gray-600 overflow-auto max-h-48 whitespace-pre-wrap border-t border-gray-200">
                {rawText}
              </pre>
            )}
          </div>
        )}

        {/* BOM에 추가/저장 버튼 */}
        <div className="flex gap-2 shrink-0">
          {isEditMode && (
            <button
              onClick={() => { resetForm(); onEditCancel && onEditCancel(); }}
              className="px-6 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 rounded-lg text-sm"
            >
              취소
            </button>
          )}
          <button
            onClick={addToBOM}
            className="flex-1 font-bold py-3 rounded-lg text-sm shadow transition-colors text-white bg-blue-700 hover:bg-blue-800"
          >
            {isEditMode ? 'BOM에 저장 (수정)' : 'BOM에 추가'}
          </button>
        </div>
      </div>

      {mergeChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="bg-blue-700 text-white px-5 py-3">
              <p className="font-bold text-sm">"{mergeChoice.existing.drawingNumber}" 도면이 이미 등록되어 있습니다</p>
              <p className="text-blue-200 text-xs mt-0.5">REV {mergeChoice.existing.rev || '—'} · 입력한 파트를 어떻게 반영할까요?</p>
            </div>
            <div className="p-4 space-y-2">
              <button
                onClick={handleMergeAppend}
                className="w-full text-left bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-4 py-3"
              >
                <p className="text-sm font-semibold text-blue-800">이어 붙이기</p>
                <p className="text-xs text-blue-600 mt-0.5">입력한 파트를 기존 파트 뒤에 추가합니다.</p>
              </button>
              <button
                onClick={handleMergeOverwrite}
                className="w-full text-left bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-4 py-3"
              >
                <p className="text-sm font-semibold text-amber-800">전체 교체</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  입력한 파트 목록을 도면의 전체 내용으로 적용합니다. 기존에 있었지만 이번 목록에
                  없는 파트는 삭제 처리(취소선)되고, 변경 내용은 수정이력에 기록됩니다.
                </p>
              </button>
              <button
                onClick={handleMergeCancel}
                className="w-full text-center bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg px-4 py-2.5 text-sm font-medium"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
