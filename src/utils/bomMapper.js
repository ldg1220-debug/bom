import { v4 as uuidv4 } from 'uuid';

/**
 * 등록된 도면 목록으로부터 전체 BOM 행 배열을 생성
 * 계층 구조: 자품번이 다른 도면의 도면번호와 일치하면 하위에 삽입
 */
export function buildBOMRows(drawings) {
  if (!drawings || drawings.length === 0) return [];

  // 도면번호 → 도면 맵
  const drawingMap = new Map(drawings.map((d) => [d.drawingNumber, d]));

  // 어떤 도면이 다른 도면의 파트리스트에 포함되는지 파악
  // parentDwgNumber: 이 도면을 파트로 포함하는 상위 도면번호
  const parentOf = new Map(); // childDwgNumber → parentDwgNumber
  for (const drawing of drawings) {
    for (const part of drawing.parts) {
      if (drawingMap.has(part.partNumber)) {
        parentOf.set(part.partNumber, drawing.drawingNumber);
      }
    }
  }

  // 루트 도면 찾기 (상위 도면이 없는 것들)
  const roots = drawings.filter((d) => !parentOf.has(d.drawingNumber));

  // 루트 도면이 없으면 모두 루트 취급
  const rootList = roots.length > 0 ? roots : drawings;

  const rows = [];
  let globalSeq = 1;

  function addDrawingRows(drawing, parentPartNumber, level, multiplier) {
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

    // 파트리스트 행들
    for (const part of drawing.parts) {
      const childDrawing = drawingMap.get(part.partNumber);

      if (childDrawing) {
        // 하위 도면이 있는 경우: 재귀적으로 하위 도면 행 추가
        addDrawingRows(childDrawing, drawing.drawingNumber, level + 1, part.qty * multiplier);
      } else {
        // 일반 파트 행
        const partRow = {
          id: uuidv4(),
          seq: globalSeq++,
          level: level + 1,
          itemType: '',
          staNo: '',
          processType: '',
          drawingDate: '',
          parentPart: drawing.drawingNumber,
          rev: '',
          no: part.seq,
          childPart: part.partNumber,
          description: part.description,
          material: part.material,
          spec: '',
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
        };
        rows.push(partRow);
      }
    }
  }

  for (const root of rootList) {
    addDrawingRows(root, '', 1, 1);
  }

  return rows;
}
