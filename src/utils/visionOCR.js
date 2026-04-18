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

export async function extractBOMWithGemini(imageBlob, apiKey) {
  const dataUrl = await blobToBase64(imageBlob);
  const base64Data = dataUrl.split(',')[1];
  const mimeType = imageBlob.type || 'image/png';

  const url = `/api/gemini/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: PROMPT },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 4096 },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API 오류 (${response.status})`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('응답에서 JSON을 찾을 수 없습니다.\n' + text.slice(0, 200));

  const parsed = JSON.parse(jsonMatch[0]);
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
