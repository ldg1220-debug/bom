import { useState, useRef, useCallback, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import { parseOCRResult } from '../utils/ocrParser';

export default function DrawingUpload({ onOCRComplete }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('idle'); // idle | processing | done | error
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrMessage, setOcrMessage] = useState('');
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  const processImage = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setOcrStatus('processing');
    setOcrProgress(0);
    setOcrMessage('OCR 초기화 중...');

    try {
      const result = await Tesseract.recognize(file, 'eng+kor', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
            setOcrMessage(`텍스트 인식 중... ${Math.round(m.progress * 100)}%`);
          } else {
            setOcrMessage(m.status);
          }
        },
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

  // 클립보드 붙여넣기
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) processImage(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processImage]);

  // 드래그 앤 드롭
  function handleDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave() {
    setIsDragging(false);
  }
  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processImage(file);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processImage(file);
    e.target.value = '';
  }

  function clearImage() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setOcrStatus('idle');
    setOcrProgress(0);
    setOcrMessage('');
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 업로드 영역 */}
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
            <img
              src={imageUrl}
              alt="업로드된 도면"
              className="w-full max-h-96 object-contain rounded-lg"
            />
            <button
              onClick={clearImage}
              className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm shadow"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-5xl mb-3 text-gray-300">📋</div>
            <p className="text-gray-600 font-medium mb-1">파트리스트 스크린샷을 여기에 붙여넣으세요</p>
            <p className="text-gray-400 text-sm mb-3">Ctrl+V · 드래그 앤 드롭 · 파일 선택</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded"
            >
              파일 선택
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* OCR 진행 상태 */}
      {ocrStatus === 'processing' && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-blue-700 font-medium">OCR 처리 중...</span>
            <span className="text-sm text-blue-600">{ocrProgress}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${ocrProgress}%` }}
            />
          </div>
          <p className="text-xs text-blue-500 mt-1">{ocrMessage}</p>
        </div>
      )}

      {ocrStatus === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded p-2 text-sm text-green-700">
          ✅ OCR 완료 — 아래 내용을 확인 및 수정 후 [BOM에 추가]를 누르세요.
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
