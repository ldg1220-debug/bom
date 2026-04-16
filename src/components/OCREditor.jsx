import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useBOM } from '../context/BOMContext';
import DrawingUpload from './DrawingUpload';
import { parseOCRResult } from '../utils/ocrParser';

const EMPTY_PART = () => ({
  id: uuidv4(),
  seq: 1,
  partNumber: '',
  description: '',
  material: '',
  qty: 1,
  unit: 'EA',
  specRemark: '',
});

export default function OCREditor({ onDrawingAdded }) {
  const { dispatch } = useBOM();

  const [drawingNumber, setDrawingNumber] = useState('');
  const [title, setTitle] = useState('');
  const [rev, setRev] = useState('');
  const [parts, setParts] = useState([EMPTY_PART()]);
  const [rawText, setRawText] = useState('');

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
      const maxSeq = prev.reduce((m, p) => Math.max(m, p.seq), 0);
      return [...prev, { ...EMPTY_PART(), seq: maxSeq + 1 }];
    });
  }

  function deleteRow(id) {
    setParts((prev) => prev.filter((p) => p.id !== id));
  }

  // Tab 키로 다음 셀 이동
  function handleKeyDown(e, rowIndex, colIndex, totalCols) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const nextCol = colIndex + 1;
      const nextRow = rowIndex + (nextCol >= totalCols ? 1 : 0);
      const nextColActual = nextCol % totalCols;

      const selector = `[data-row="${nextRow}"][data-col="${nextColActual}"]`;
      const el = document.querySelector(selector);
      if (el) el.focus();
      else if (nextRow >= parts.length) addRow();
    }
  }

  function addToBoM() {
    if (!drawingNumber.trim()) {
      alert('도면번호를 입력하세요.');
      return;
    }

    const drawing = {
      id: uuidv4(),
      drawingNumber: drawingNumber.trim(),
      title: title.trim(),
      rev: rev.trim(),
      parts: parts
        .filter((p) => p.partNumber || p.description)
        .map((p, i) => ({
          seq: p.seq || i + 1,
          partNumber: p.partNumber || '',
          description: p.description || '',
          material: p.material || '',
          qty: parseFloat(p.qty) || 1,
          unit: p.unit || 'EA',
          specRemark: p.specRemark || '',
        })),
      rawOcr: rawText,
      createdAt: new Date().toISOString(),
    };

    dispatch({ type: 'ADD_DRAWING', drawing });
    onDrawingAdded && onDrawingAdded();

    // 폼 초기화
    setDrawingNumber('');
    setTitle('');
    setRev('');
    setParts([EMPTY_PART()]);
    setRawText('');
  }

  const COLS = ['seq', 'partNumber', 'description', 'material', 'qty', 'unit', 'specRemark'];
  const COL_LABELS = ['순번', 'PART NO.', '품명', '재질', '수량', '단위', 'SPEC & REMARK'];
  const COL_WIDTHS = ['w-12', 'w-40', 'w-48', 'w-28', 'w-14', 'w-16', 'w-36'];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 이미지 업로드 */}
      <DrawingUpload onOCRComplete={handleOCRComplete} />

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
              className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
              value={rev}
              onChange={(e) => setRev(e.target.value)}
              placeholder="A"
            />
          </div>
        </div>
      </div>

      {/* 파트리스트 편집 테이블 */}
      <div className="bg-white border border-gray-200 rounded-lg flex flex-col flex-1 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-700">파트리스트</h3>
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
                    <td key={col} className="px-1 py-1">
                      <input
                        data-row={rowIdx}
                        data-col={colIdx}
                        className={`w-full border border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none rounded px-1 py-0.5 bg-transparent focus:bg-white ${
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
                  <td className="px-1 py-1 text-center">
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

      {/* BOM에 추가 버튼 */}
      <button
        onClick={addToBoM}
        className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-lg text-sm shadow transition-colors"
      >
        BOM에 추가
      </button>
    </div>
  );
}
