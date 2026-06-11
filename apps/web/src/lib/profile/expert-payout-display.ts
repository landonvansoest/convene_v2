/**
 * Hide all digits except the last four (common bank account display pattern).
 */
export function maskDigitsExceptLastFour(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return "*".repeat(digits.length);
  const last = digits.slice(-4);
  return `${"*".repeat(digits.length - 4)}${last}`;
}
