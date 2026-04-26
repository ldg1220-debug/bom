import { v4 as uuidv4 } from 'uuid';

/**
 * 순환 참조 감지. 발견된 경우 경고 문자열 배열을 반환.
 */
export function detectCircularReferences(drawings) {
  const drawingMap = new Map(drawings.map((d) => [d.drawingNumber, d]));
  const warnings = [];
  const globalVisited = new Set();

  function dfs(dwgNumber, path) {
    if (path.includes(dwgNumber)) {
      warnings.push(`순환 참조 감지: ${[...path, dwgNumber].join(' → ')}`);
      return;
    }
    if (globalVisited.has(dwgNumber)) return;
    const drawing = drawingMap.get(dwgNumber);
    if (!drawing) return;
    for (const part of drawing.parts) {
      if (drawingMap.has(part.partNumber)) {
        dfs(part.partNumber, [...path, dwgNumber]);
      }
    }
    globalVisited.add(dwgNumber);
  }

  for (const d of drawings) {
    dfs(d.drawingNumber, []);
  }
  return warnings;
}

/**
 * 등록된 도면 목록으로부터 전체 BOM 행 배열을 DFS 순서로 생성.
 * 자품번이 다른 도면의 도면번호와 일치하면 계층 하위에 삽입.
 * multiplier 전파: 상위 조립품에서 이 부품이 쓰이는 수량 × 상위 multiplier
 */
export function buildBOMRows(drawings) {
  if (!drawings || drawings.length === 0) return [];

  const drawingMap = new Map(drawings.map((d) => [d.drawingNumber, d]));

  // 어떤 도면이 다른 도면의 파트리스트에 포함되는지 파악
  const parentOf = new Map(); // childDwgNumber → parentDwgNumber
  for (const drawing of drawings) {
    for (const part of drawing.parts) {
      if (drawingMap.has(part.partNumber)) {
        // 이미 다른 부모가 있으면 첫 번째만 인정 (다중 부모 방지)
        if (!parentOf.has(part.partNumber)) {
          parentOf.set(part.partNumber, drawing.drawingNumber);
        }
      }
    }
  }

  // 루트 도면 찾기 (상위 도면이 없는 것들)
  const roots = drawings.filter((d) => !parentOf.has(d.drawingNumber));
  const rootList = roots.length > 0 ? roots : drawings;

  const rows = [];
  let globalSeq = 1;

  function addDrawingRows(drawing, parentPartNumber, level, multiplier, visitedPath) {
    // 순환 참조 방지
    if (visitedPath.has(drawing.drawingNumber)) return;

    const newVisited = new Set(visitedPath);
    newVisited.add(drawing.drawingNumber);

    // 이 도면 자체 행 (ASSY 행)
    const drawingRow = {
      id: uuidv4(),
      seq: globalSeq++,
      level,
      itemType: '',
      staNo: '',
      processType: '',
      drawingDate: '',
      parentPart: parentPartNumber,
      rev: drawing.rev,
      no: 0,
      childPart: drawing.drawingNumber,
      description: drawing.title,
      material: 'ASSY',
      spec: '',
      sizeT: '',
      sizeW: '',
      sizeL: '',
      weight: '',
      unit: 'EA',
      unitQty: 1,
      multiplier,
      qtyPerOne: multiplier,
      qtyTotal: 0,
      remark: '',
      drawingId: drawing.id,
      isAssyRow: true,
    };
    rows.push(drawingRow);

    // 파트리스트 행들 (DFS)
    for (const part of drawing.parts) {
      const childDrawing = drawingMap.get(part.partNumber);

      if (childDrawing) {
        // 하위 도면이 있는 경우: 재귀적으로 하위 도면 행 추가
        // 하위 ASSY의 multiplier = 이 파트의 수량 × 현재 multiplier
        addDrawingRows(
          childDrawing,
          drawing.drawingNumber,
          level + 1,
          part.qty * multiplier,
          newVisited
        );
      } else {
        // 일반 파트 행
        // 파트의 multiplier = 현재 도면의 multiplier (부모 ASSY의 multiplier)
        const partRow = {
          id: uuidv4(),
          seq: globalSeq++,
          level: level + 1,
          itemType: '',
          staNo: part.staNo || '',
          processType: part.processType || '',
          drawingDate: '',
          parentPart: drawing.drawingNumber,
          rev: '',
          no: part.seq,
          childPart: part.partNumber,
          description: part.description,
          material: part.material,
          spec: part.spec || '',
          vendor: part.vendor || '',
          sizeT: '',
          sizeW: '',
          sizeL: '',
          weight: '',
          unit: part.unit || 'EA',
          unitQty: part.qty,
          multiplier,
          qtyPerOne: 0,
          qtyTotal: 0,
          remark: part.specRemark || '',
          drawingId: drawing.id,
          isAssyRow: false,
          _deletedInRev: part._deletedInRev || false,
          _qtyChangedFrom: part._qtyChangedFrom ?? null,
        };
        rows.push(partRow);
      }
    }
  }

  for (const root of rootList) {
    addDrawingRows(root, '', 1, 1, new Set());
  }

  return rows;
}
