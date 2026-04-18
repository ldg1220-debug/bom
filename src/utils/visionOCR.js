/** Google Gemini Vision API를 통한 BOM 구조화 추출 */

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const PROMPT = `이 이미지는 기계 부품 도면(Engineering BOM)의 파트리스트 스크린샷입니다.
표와 타이틀 블록에서 정보를 추출하여 아래 JSON 형식으로만 응답하세요 (JSON 외 다른 텍스트 없이).

규칙:
- partNumber: 정확히 읽어주세요. 예) RM-LC01-FC23344, CP709017-401
- seq: 표의 순번(NO.) 숫자
- qty: 숫자만 (없으면 1)
- unit: EA, SET, M 등 (없으면 "EA")
- material: 재질 (A5052P-H32, SUS304 등, 없으면 "")
- specRemark: SPEC & REMARK 열 내용 (없으면 "")
- drawingNumber: 도면번호 (DWG NO. 또는 타이틀 블록에서)
- title: 도면 제목
- rev: 개정번호 (A, B 등)

{
  "drawingNumber": "",
  "title": "",
  "rev": "",
  "parts": [
    {
      "seq": 1,
      "partNumber": "",
      "description": "",
      "material": "",
      "qty": 1,
      "unit": "EA",
      "specRemark": ""
    }
  ]
}`;

// 우선순위 순 초기 모델 목록
const DEFAULT_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-001',
  'gemini-1.5-flash-8b',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest',
];

async function listGeminiModels(apiKey) {
  try {
    const url = `/api/gemini/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
  } catch {
    return [];
  }
}

function parseResult(parsed, text) {
  return {
    drawingNumber: parsed.drawingNumber || '',
    title: parsed.title || '',
    rev: parsed.rev || '',
    parts: (parsed.parts || []).map((p, i) => ({
      seq: Number(p.seq) || i + 1,
      partNumber: String(p.partNumber || '').trim(),
      description: String(p.description || '').trim(),
      material: String(p.material || '').trim(),
      qty: parseFloat(p.qty) || 1,
      unit: String(p.unit || 'EA').trim().toUpperCase(),
      specRemark: String(p.specRemark || '').trim(),
    })),
    rawText: text,
  };
}

async function tryModels(models, body, apiKey) {
  let lastErr = null;
  let allNotFound = true;

  for (const model of models) {
    const url = `/api/gemini/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || `API 오류 (${response.status})`;
      if (response.status === 404) { lastErr = new Error(msg); continue; }
      allNotFound = false;
      if (response.status === 429) {
        const retryMatch = msg.match(/retry in ([\d.]+)s/i);
        const retrySec = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 60;
        const e = new Error(msg);
        e.retrySec = retrySec;
        throw e;
      }
      throw new Error(msg);
    }

    allNotFound = false;
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('응답에서 JSON을 찾을 수 없습니다.\n' + text.slice(0, 200));
    return parseResult(JSON.parse(jsonMatch[0]), text);
  }

  return { allNotFound, lastErr };
}

export async function extractBOMWithGemini(imageBlob, apiKey) {
  const dataUrl = await blobToBase64(imageBlob);
  const base64Data = dataUrl.split(',')[1];
  const mimeType = imageBlob.type || 'image/png';

  const body = JSON.stringify({
    contents: [{
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: PROMPT },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 4096 },
  });

  // 1차: 기본 모델 목록 시도
  const result1 = await tryModels(DEFAULT_MODELS, body, apiKey);
  if (result1 && !result1.allNotFound) return result1;

  // 2차: 모든 모델이 404면 ListModels API로 실제 사용 가능 모델 조회 후 재시도
  const discovered = await listGeminiModels(apiKey);
  if (discovered.length > 0) {
    const result2 = await tryModels(discovered, body, apiKey);
    if (result2 && !result2.allNotFound) return result2;
  }

  const lastErr = (result1 && result1.lastErr) || null;
  if (lastErr) throw lastErr;
  throw new Error(
    discovered.length === 0
      ? 'ListModels 조회 실패 — API 키가 유효한지, Generative Language API가 활성화되어 있는지 확인하세요.'
      : '사용 가능한 Gemini 모델을 찾을 수 없습니다: ' + discovered.join(', ')
  );
}
