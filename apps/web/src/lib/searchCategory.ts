const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

/** Resolve `search?category=` value to a UUID for `/api/experts` when the param is a display name. */
export function resolveCategoryIdForSearch(
  param: string,
  categories: { category_id: string; name: string }[]
): string {
  const raw = param.trim();
  if (!raw) return "";
  if (isUuid(raw)) return raw;
  const decoded = decodeURIComponent(raw).replace(/\+/g, " ").trim();
  const hit = categories.find((c) => c.name.toLowerCase() === decoded.toLowerCase());
  return hit?.category_id ?? raw;
}
