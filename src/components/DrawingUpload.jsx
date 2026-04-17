import { useState, useRef, useCallback, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import { parseOCRResult } from '../utils/ocrParser';
import { extractBOMWithClaude } from '../utils/visionOCR';

const STORAGE_KEY = 'anthropic_api_key';

/**
 * 이미지에서 긴 수평/수직 직선(표 테두리)을 흰색으로 지워 OCR 오독 방지
 */
function removeBorderLines(d, w, h) {
  const DARK = 120;
  const PAD = 2;    // 선 제거 후 양방향으로 확장할 픽셀 수 (잔여 선 픽셀 제거)
  const MIN_H = Math.floor(w * 0.18); // 수평선: 이미지 너비의 18% 이상
  const MIN_V = Math.floor(h * 0.07); // 수직선: 이미지 높이의 7% 이상

  // 수평 직선 제거 (y축 ±PAD 확장)
  for (let y = 0; y < h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const dark = x < w && d[(y * w + x) * 4] < DARK;
      if (dark && start === -1) start = x;
      if (!dark && start >= 0) {
        if (x - start >= MIN_H) {
          for (let i = start; i < x; i++) {
            for (let dy = -PAD; dy <= PAD; dy++) {
              const yy = y + dy;
              if (yy >= 0 && yy < h) {
                d[(yy * w + i) * 4] = d[(yy * w + i) * 4 + 1] = d[(yy * w + i) * 4 + 2] = 255;
              }
            }
          }
        }
        start = -1;
      }
    }
  }

  // 수직 직선 제거 (x축 ±PAD 확장)
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const dark = y < h && d[(y * w + x) * 4] < DARK;
      if (dark && start === -1) start = y;
      if (!dark && start >= 0) {
        if (y - start >= MIN_V) {
          for (let i = start; i < y; i++) {
            for (let dx = -PAD; dx <= PAD; dx++) {
              const xx = x + dx;
              if (xx >= 0 && xx < w) {
                d[(i * w + xx) * 4] = d[(i * w + xx) * 4 + 1] = d[(i * w + xx) * 4 + 2] = 255;
              }
            }
          }
        }
        start = -1;
      }
    }
  }
}

/**
 * OCR 전처리: 업스케일 + 그레이스케일 + 대비 강화 + 테두리 선 제거
 */
async function preprocessImageForOCR(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const TARGET_WIDTH = 2000;
        const scale = img.width < TARGET_WIDTH ? TARGET_WIDTH / img.width : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;

        // 그레이스케일 + 대비 강화
        for (let i = 0; i < d.length; i += 4) {
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const v = Math.min(255, Math.max(0, 1.6 * (gray - 128) + 128));
          d[i] = d[i + 1] = d[i + 2] = v;
        }

        // 표 테두리 직선 제거
        removeBorderLines(d, w, h);

        ctx.putImageData(imageData, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지 로드 실패')); };
    img.src = url;
  });
}

export default function DrawingUpload({ onOCRComplete }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [currentFile, setCurrentFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('idle');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrMessage, setOcrMessage] = useState('');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  // ── Claude Vision AI 인식 ──────────────────────────────────────
  const processWithClaude = useCallback(async (file) => {
    const key = localStorage.getItem(STORAGE_KEY);
    if (!key) { setShowKeyInput(true); return; }

    setOcrStatus('processing');
    setOcrProgress(0);
    setOcrMessage('Claude AI로 분석 중...');
    try {
      const parsed = await extractBOMWithClaude(file, key);
      setOcrStatus('done');
      setOcrMessage('AI 인식 완료');
      onOCRComplete({ ...parsed, rawText: parsed.rawText || '' });
    } catch (err) {
      console.error('Claude Vision error:', err);
      setOcrStatus('error');
      setOcrMessage('AI 오류: ' + err.message);
    }
  }, [onOCRComplete]);

  // ── Tesseract OCR 인식 ─────────────────────────────────────────
  const processImage = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setCurrentFile(file);
    setOcrStatus('processing');
    setOcrProgress(0);
    setOcrMessage('이미지 전처리 중...');

    try {
      const processedBlob = await preprocessImageForOCR(file);
      setOcrMessage('OCR 초기화 중...');

      const result = await Tesseract.recognize(processedBlob, 'eng+kor', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
            setOcrMessage(`텍스트 인식 중... ${Math.round(m.progress * 100)}%`);
          } else {
            setOcrMessage(m.status);
          }
        },
        tessedit_pageseg_mode: '3',
        preserve_interword_spaces: '1',
      });

      const parsed = parseOCRResult(result);
      setOcrStatus('done');
      setOcrMessage('OCR 완료');
      onOCRComplete(parsed);
    } catch (err) {
      console.error('OCR error:', err);
      setOcrStatus('error');
      setOcrMessage('OCR 오류: ' + err.message);
    }
  }, [onOCRComplete]);

  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { setCurrentFile(file); processImage(file); }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processImage]);

  function handleDragOver(e) { e.preventDefault(); setIsDragging(true); }
  function handleDragLeave() { setIsDragging(false); }
  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) { setCurrentFile(file); processImage(file); }
  }
  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) { setCurrentFile(file); processImage(file); }
    e.target.value = '';
  }
  function saveApiKey() {
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setApiKey(trimmed);
    setShowKeyInput(false);
    setKeyDraft('');
    if (currentFile) processWithClaude(currentFile);
  }

  function clearImage() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setCurrentFile(null);
    setOcrStatus('idle');
    setOcrProgress(0);
    setOcrMessage('');
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={dropRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-blue-400'
        }`}
      >
        {imageUrl ? (
          <div className="relative">
            <img src={imageUrl} alt="업로드된 도면" className="w-full max-h-96 object-contain rounded-lg" />
            <button
              onClick={clearImage}
              className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm shadow"
            >✕</button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-5xl mb-3 text-gray-300">📋</div>
            <p className="text-gray-600 font-medium mb-1">파트리스트 스크린샷을 여기에 붙여넣으세요</p>
            <p className="text-gray-400 text-sm mb-3">Ctrl+V · 드래그 앤 드롭 · 파일 선택</p>
            <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded">
              파일 선택
            </button>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

      {/* AI 인식 버튼 (이미지가 있고 idle/done/error 상태일 때) */}
      {currentFile && ocrStatus !== 'processing' && (
        <div className="flex gap-2">
          <button
            onClick={() => processWithClaude(currentFile)}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-2 rounded-lg flex items-center justify-center gap-1.5"
          >
            ✨ Claude AI로 재인식
          </button>
          <button
            onClick={() => processImage(currentFile)}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm px-3 py-2 rounded-lg"
          >
            OCR 재인식
          </button>
          <button
            onClick={() => { setShowKeyInput(true); setKeyDraft(apiKey); }}
            className="shrink-0 text-gray-400 hover:text-gray-600 text-xs px-2 py-2"
            title="API 키 설정"
          >
            🔑
          </button>
        </div>
      )}

      {/* API 키 입력 모달 */}
      {showKeyInput && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex flex-col gap-2">
          <p className="text-xs text-purple-800 font-medium">Anthropic API 키 입력</p>
          <p className="text-xs text-purple-600">
            키는 브라우저 localStorage에만 저장되며 외부로 전송되지 않습니다.
          </p>
          <input
            type="password"
            className="w-full border border-purple-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-purple-500"
            placeholder="sk-ant-..."
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveApiKey()}
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={saveApiKey} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm py-1.5 rounded">
              저장 후 인식
            </button>
            <button onClick={() => setShowKeyInput(false)} className="px-3 bg-gray-200 hover:bg-gray-300 text-gray-600 text-sm py-1.5 rounded">
              취소
            </button>
          </div>
        </div>
      )}

      {ocrStatus === 'processing' && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-blue-700 font-medium">인식 중...</span>
            {ocrProgress > 0 && <span className="text-sm text-blue-600">{ocrProgress}%</span>}
          </div>
          {ocrProgress > 0 && (
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${ocrProgress}%` }} />
            </div>
          )}
          <p className="text-xs text-blue-500 mt-1">{ocrMessage}</p>
        </div>
      )}
      {ocrStatus === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded p-2 text-sm text-green-700">
          ✅ {ocrMessage} — 아래 내용을 확인 및 수정 후 [BOM에 추가]를 누르세요.
        </div>
      )}
      {ocrStatus === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">
          ❌ {ocrMessage}
        </div>
      )}
    </div>
  );
}
