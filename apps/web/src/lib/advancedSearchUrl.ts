export type AdvancedSearchFilters = {
  keywords: string;
  categoryId: string;
  profession: string;
  skills: string[];
  minRating: number;
  maxRate: number;
  availableNow: boolean;
  verifiedOnly: boolean;
};

export function buildAdvancedSearchUrl(filters: AdvancedSearchFilters): string {
  const params = new URLSearchParams();
  const q = [filters.keywords, filters.profession, ...filters.skills].filter(Boolean).join(" ").trim();
  if (q) params.set("q", q);
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (filters.verifiedOnly) params.set("verified", "1");
  if (filters.availableNow) params.set("available", "1");
  if (filters.maxRate < 250) params.set("max_rate", String(filters.maxRate));
  if (filters.minRating > 0) params.set("min_rating", String(filters.minRating));
  if (filters.skills.length) params.set("skills", filters.skills.map((s) => s.trim()).filter(Boolean).join(","));
  params.set("advanced", "1");
  const s = params.toString();
  return s ? `/search?${s}` : "/search";
}
