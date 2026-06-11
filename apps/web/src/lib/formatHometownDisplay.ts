const USA_SYNONYMS = new Set([
  "usa",
  "us",
  "u.s.",
  "u.s.a.",
  "united states",
  "united states of america",
]);

function normalizedParts(raw: string): string[] {
  let t = raw.trim().replace(/\s+/g, " ");
  if (!t) return [];
  t = t.replace(/\b\d{5}(?:-\d{4})?\b/gi, "").trim();
  t = t.replace(/\s*,\s*,/g, ",").replace(/,\s*$/, "").trim();
  return t
    .split(",")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isUsaCountrySegment(s: string): boolean {
  const x = s.trim().toLowerCase();
  if (USA_SYNONYMS.has(x)) return true;
  return /^(the\s+)?united\s+states(\s+of\s+america)?$/i.test(x.trim());
}

/**
 * Strips typical US ZIP codes and presents **City, State** for US-shaped places
 * (last segment USA / United States) or **City, Country** elsewhere (city + final segment).
 */
export function formatHometownForDisplay(raw: string | null | undefined): string {
  const parts = normalizedParts(String(raw ?? ""));
  if (!parts.length) return "";

  const last = parts[parts.length - 1]!;
  if (isUsaCountrySegment(last)) {
    const locality = parts.slice(0, -1);
    if (locality.length >= 2) return `${locality[0]}, ${locality[1]}`;
    if (locality.length === 1) return locality[0]!;
    return "";
  }

  if (parts.length >= 2) return `${parts[0]}, ${last}`;
  return parts[0]!;
}
