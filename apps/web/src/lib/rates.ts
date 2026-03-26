/**
 * Pricing convention (owner decision, 2025): **`expert_availability.rate` is always USD per 15 minutes** in v2.
 * Legacy v1 hourly figures: divide by 4 when migrating or comparing to v1.
 */
export const RATE_LABEL_SHORT = "/ 15 min";

export function formatRatePer15Min(rate: number | null | undefined): string {
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} ${RATE_LABEL_SHORT}`.trim();
}
