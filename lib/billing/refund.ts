export type RefundClassification = "full" | "partial" | "unknown";

export type ClassifyRefundInput = {
  refundAmount: number | null;
  refundCurrency: string | null;
  isPartial: boolean | null;
  paidTotal: number | null;
  paidCurrency: string | null;
};

/**
 * Decide whether a refund reverses the whole lifetime payment. Amounts are
 * minor units. Unknown data never revokes; it is flagged for review instead.
 */
export function classifyRefund({
  refundAmount,
  refundCurrency,
  isPartial,
  paidTotal,
  paidCurrency,
}: ClassifyRefundInput): RefundClassification {
  if (isPartial === true) {
    return "partial";
  }
  if (
    refundAmount == null ||
    paidTotal == null ||
    !Number.isFinite(refundAmount) ||
    !Number.isFinite(paidTotal)
  ) {
    return "unknown";
  }
  if (
    refundCurrency !== null &&
    paidCurrency !== null &&
    refundCurrency !== paidCurrency
  ) {
    return "unknown";
  }
  return refundAmount >= paidTotal ? "full" : "partial";
}
