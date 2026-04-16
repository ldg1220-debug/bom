/**
 * BOM 행들의 소요량 계산
 * - qtyPerOne (1량 소요량) = unitQty × multiplier
 * - qtyTotal (총수량) = qtyPerOne × totalQty
 */
export function recalculate(bomRows, totalQty) {
  return bomRows.map((row) => {
    const qtyPerOne = row.isAssyRow ? row.multiplier : row.unitQty * row.multiplier;
    const qtyTotal = qtyPerOne * (totalQty || 1);
    return { ...row, qtyPerOne, qtyTotal };
  });
}
