import { v4 as uuidv4 } from 'uuid';

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
      if (!part._noChild && drawingMap.has(part.partNumber)) {
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

export function buildBOMRows(drawings) {
  if (!drawings || drawings.length === 0) return [];

  const drawingMap = new Map(drawings.map((d) => [d.drawingNumber, d]));

  const parentOf = new Map();
  for (const drawing of drawings) {
    for (const part of drawing.parts) {
      if (!part._noChild && drawingMap.has(part.partNumber)) {
        if (!parentOf.has(part.partNumber)) {
          parentOf.set(part.partNumber, drawing.drawingNumber);
        }
      }
    }
  }

  const roots = drawings.filter((d) => !parentOf.has(d.drawingNumber));
  const rootList = roots.length > 0 ? roots : drawings;

  const rows = [];
  let globalSeq = 1;

  function addDrawingRows(drawing, parentPartNumber, level, multiplier, visitedPath, parentPartSeq = 0) {
    if (visitedPath.has(drawing.drawingNumber)) return;

    const newVisited = new Set(visitedPath);
    newVisited.add(drawing.drawingNumber);

    rows.push({
      id: uuidv4(),
      seq: globalSeq++,
      level,
      itemType: '',
      staNo: '',
      processType: '',
      drawingDate: '',
      parentPart: parentPartNumber,
      rev: drawing.rev,
      no: parentPartSeq,
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
    });

    const sortedParts = [...drawing.parts].sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
    for (const part of sortedParts) {
      const childDrawing = part._noChild ? null : drawingMap.get(part.partNumber);

      if (childDrawing) {
        addDrawingRows(
          childDrawing,
          drawing.drawingNumber,
          level + 1,
          part.qty * multiplier,
          newVisited,
          part.seq
        );
      } else {
        rows.push({
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
          vendor: part.vendor || '',
          drawingId: drawing.id,
          isAssyRow: false,
          _noChild: part._noChild || false,
          _deletedInRev: part._deletedInRev || false,
          _qtyChangedFrom: part._qtyChangedFrom ?? null,
        });
      }
    }
  }

  for (const root of rootList) {
    addDrawingRows(root, '', 1, 1, new Set());
  }

  return rows;
}
