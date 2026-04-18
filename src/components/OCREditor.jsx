import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useBOM } from '../context/BOMContext';
import DrawingUpload from './DrawingUpload';

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
  const [appendMode, setAppendMode] = useState(false);
  const [appendTargetId, setAppendTargetId] = useState('');
  const isEditMode = !!editDrawing;

  // 재등록 모드: editDrawing prop으로 폼을 채움
  useEffect(() => {
    if (editDrawing) {
      setDrawingNumber(editDrawing.drawingNumber || '');
      setTitle(editDrawing.title || '');
      setRev(editDrawing.rev || '');
      setRawText(editDrawing.rawOcr || '');
      setParts(
        editDrawing.parts.length > 0
          ? editDrawing.parts.map((p) => ({ ...p, id: uuidv4() }))
          : [EMPTY_PART()]
      );
    }
  }, [editDrawing]);

  function handleOCRComplete(parsed) {
    setDrawingNumber(parsed.drawingNumber || '');
    setTitle(parsed.title || '');
    setRev(parsed.rev || '');
    setRawText(parsed.rawText || '');
    if (parsed.parts && parsed.parts.length > 0) {
      setParts(parsed.parts.map((p) => ({ ...p, id: uuidv4() })));
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
        // 새 행이 렌더된 후 포커스 (다음 틱)
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
    setAppendMode(false);
    setAppendTargetId('');
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

    // 추가 모드: 기존 도면에 파트 병합
    if (appendMode) {
      if (!appendTargetId) { alert('추가할 도면을 선택하세요.'); return; }
      if (validParts.length === 0) { alert('추가할 파트가 없습니다.'); return; }
      dispatch({ type: 'APPEND_PARTS_TO_DRAWING', drawingId: appendTargetId, newParts: validParts });
      onDrawingAdded && onDrawingAdded();
      resetForm();
      return;
    }

    const trimmed = drawingNumber.trim();
    if (!trimmed) {
      alert('도면번호를 입력하세요.');
      return;
    }

    // 중복 도면번호 감지 (재등록 모드가 아닌 경우만)
    const existing = drawings.find((d) => d.drawingNumber === trimmed);
    if (existing && !isEditMode) {
      const ok = confirm(
        `"${trimmed}" 도면이 이미 등록되어 있습니다.\n기존 데이터를 덮어쓰시겠습니까?`
      );
      if (!ok) return;
    }

    const drawing = {
      id: editDrawing ? editDrawing.id : uuidv4(),
      drawingNumber: trimmed,
      title: title.trim(),
      rev: rev.trim(),
      parts: validParts,
      rawOcr: rawText,
      createdAt: editDrawing ? editDrawing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    dispatch({ type: 'ADD_DRAWING', drawing });
    onDrawingAdded && onDrawingAdded();
    resetForm();
    if (isEditMode) onEditCancel && onEditCancel();
  }

  const [showRaw, setShowRaw] = useState(false);

  const COLS = ['seq', 'partNumber', 'description', 'material', 'qty', 'unit', 'specRemark'];
  const COL_LABELS = ['No', 'PART NO.', '품명', '재질', '수량', '단위', 'SPEC & REMARK'];
  const COL_WIDTHS = ['w-12', 'w-40', 'w-44', 'w-28', 'w-14', 'w-16', 'w-36'];

  return (
    <div className="flex flex-col gap-4 h-full">
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
      <DrawingUpload onOCRComplete={handleOCRComplete} />

      {/* 모드 토글 (편집 모드에서는 숨김) */}
      {!isEditMode && drawings.length > 0 && (
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setAppendMode(false)}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              !appendMode ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            새 도면 등록
          </button>
          <button
            onClick={() => setAppendMode(true)}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              appendMode ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            기존 도면에 파트 추가
          </button>
        </div>
      )}

      {/* 도면 정보 */}
      {appendMode ? (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-orange-700 mb-1">어느 도면에 추가할까요?</h3>
          <p className="text-xs text-orange-500 mb-3">도면번호가 없는 분할 스크린샷을 올렸을 때 사용하세요.</p>
          <select
            className="w-full border border-orange-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-500 bg-white"
            value={appendTargetId}
            onChange={(e) => setAppendTargetId(e.target.value)}
          >
            <option value="">— 도면 선택 —</option>
            {drawings.map((d) => (
              <option key={d.id} value={d.id}>
                {d.drawingNumber}{d.title ? ` · ${d.title}` : ''} ({d.parts.length}파트)
              </option>
            ))}
          </select>
        </div>
      ) : (
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
        </div>
      )}

      {/* 파트리스트 편집 테이블 */}
      <div className="bg-white border border-gray-200 rounded-lg flex flex-col overflow-hidden" style={{ minHeight: 200 }}>
        <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-700">
            파트리스트 <span className="text-gray-400 font-normal">({parts.filter(p => p.partNumber || p.description).length}개)</span>
          </h3>
          <span className="text-xs text-gray-400">Tab 키로 다음 셀 이동</span>
        </div>

        <div className="overflow-auto flex-1">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
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
              {parts.map((part, rowIdx) => (
                <tr key={part.id} className="border-b border-gray-100 hover:bg-blue-50">
                  {COLS.map((col, colIdx) => (
                    <td key={col} className="px-1 py-0.5">
                      <input
                        data-row={rowIdx}
                        data-col={colIdx}
                        className={`w-full border border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none rounded px-1 py-0.5 bg-transparent focus:bg-white text-xs ${
                          col === 'seq' ? 'text-center' : ''
                        }`}
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
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 border-t border-gray-200">
          <button
            onClick={addRow}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            + 행 추가
          </button>
        </div>
      </div>

      {/* Raw OCR 텍스트 (디버그) */}
      {rawText && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="w-full px-4 py-2 text-xs text-gray-500 flex items-center justify-between hover:bg-gray-100"
          >
            <span>🔍 Raw OCR 텍스트 (파싱 확인용)</span>
            <span>{showRaw ? '▲ 접기' : '▼ 펼치기'}</span>
          </button>
          {showRaw && (
            <pre className="px-4 py-3 text-xs text-gray-600 overflow-auto max-h-64 whitespace-pre-wrap border-t border-gray-200">
              {rawText}
            </pre>
          )}
        </div>
      )}

      {/* BOM에 추가/저장 버튼 */}
      <div className="flex gap-2">
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
          className={`flex-1 font-bold py-3 rounded-lg text-sm shadow transition-colors text-white ${
            appendMode
              ? 'bg-orange-600 hover:bg-orange-700'
              : 'bg-blue-700 hover:bg-blue-800'
          }`}
        >
          {isEditMode ? 'BOM에 저장 (수정)' : appendMode ? '선택 도면에 파트 추가' : 'BOM에 추가'}
        </button>
      </div>
    </div>
  );
}
