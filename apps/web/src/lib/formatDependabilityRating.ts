/** Formats a 0–100 dependability rating for display (always includes %). */
export function formatDependabilityRating(
  rating: number | null | undefined,
  fallback = "—",
): string {
  if (rating == null || !Number.isFinite(Number(rating))) return fallback;
  return `${Math.round(Number(rating))}%`;
}
