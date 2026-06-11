import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { hydrateExperts, type HydratedExpert } from "@/lib/experts/hydrate";
import {
  EXPERT_VISIBILITY_STATE,
  expertVisibilityStatesForBrowseGrid,
} from "@/lib/expertVisibilityState";
import { getFeaturedExpertsSettings } from "@/lib/featuredExpertsSettings";
import {
  getExpansionForQuery,
  type QueryExpansion,
} from "@/lib/search/queryExpansion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/search/experts is the Bible §"Search engine contract" endpoint.
 * Runs server-side FTS over expert_profiles.search_vector with Advanced
 * Search filters applied as hard SQL clauses, then ranks/merges per mode:
 *
 *   - keyword : single FTS pass with `q`.
 *   - semantic: OpenAI query expansion → FTS over expanded keywords + FAQ-
 *               derived category boost. Falls back to keyword on timeout.
 *   - hybrid  : keyword + semantic run in parallel, merged via RRF (k=60).
 *               This is the default for the search page.
 *
 * The response always includes `mode_used` so the UI can detect fallbacks
 * (e.g. semantic asked for, keyword delivered because OpenAI timed out).
 */

type SearchMode = "keyword" | "semantic" | "hybrid";

const MAX_LIMIT = 100;
const MAX_SKILLS = 10;
const RRF_K = 60;
// We over-fetch slightly per leg so the RRF merge has room to outrank a
// barely-matching candidate that happened to land at rank #limit on one side.
const RRF_OVERFETCH = 50;
/** Over-fetch when filtering "Available now" in app layer (SQL flag is not calendar-derived). */
const AVAILABLE_NOW_FETCH_MULTIPLIER = 5;

function parseBool(raw: string | null): boolean {
  if (!raw) return false;
  const v = raw.toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function parseNumber(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseMode(raw: string | null): SearchMode {
  if (raw === "keyword" || raw === "semantic" || raw === "hybrid") return raw;
  return "hybrid";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const q = (searchParams.get("q") ?? "").trim();
  const requestedMode = parseMode(searchParams.get("mode"));

  const categoryId = searchParams.get("category");
  const profession = searchParams.get("profession");
  const skills = [
    ...searchParams.getAll("skill"),
    ...(searchParams.get("skills") ?? "").split(","),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SKILLS);
  const minRating = parseNumber(searchParams.get("min_rating"));
  const maxRate = parseNumber(searchParams.get("max_rate"));
  const verifiedOnly = parseBool(searchParams.get("verified"));
  const availableNowOnly =
    parseBool(searchParams.get("available_now")) || parseBool(searchParams.get("available"));
  const onlineNowOnly = parseBool(searchParams.get("online_now"));

  const limit = Math.min(
    Math.max(parseNumber(searchParams.get("limit")) ?? 48, 1),
    MAX_LIMIT,
  );
  const offset = Math.max(parseNumber(searchParams.get("offset")) ?? 0, 0);

  const admin = createAdminClient();

  let visibilityStates: string[];
  try {
    const featured = await getFeaturedExpertsSettings(admin);
    visibilityStates = expertVisibilityStatesForBrowseGrid(featured);
    if (visibilityStates.length === 0) {
      visibilityStates = [EXPERT_VISIBILITY_STATE.VISIBLE_ACTIVE];
    }
  } catch {
    visibilityStates = [EXPERT_VISIBILITY_STATE.VISIBLE_ACTIVE];
  }

  const filters: HardFilters = {
    categoryId,
    profession,
    skills,
    minRating,
    maxRate,
    verifiedOnly,
    availableNowOnly,
    onlineNowOnly,
    visibilityStates,
  };

  // When q is empty the three modes degenerate to the same query — semantic
  // expansion has nothing to expand. Treat as keyword so we don't waste an
  // OpenAI roundtrip.
  const effectiveMode: SearchMode = q ? requestedMode : "keyword";

  let candidateIds: string[];
  let modeUsed: SearchMode = effectiveMode;

  try {
    if (effectiveMode === "keyword") {
      candidateIds = await runKeywordRetrieval(admin, q, filters, limit, offset);
    } else if (effectiveMode === "semantic") {
      const result = await runSemanticRetrieval(admin, q, filters, limit, offset);
      candidateIds = result.ids;
      modeUsed = result.fellBack ? "keyword" : "semantic";
    } else {
      const result = await runHybridRetrieval(admin, q, filters, limit, offset);
      candidateIds = result.ids;
      modeUsed = result.fellBack ? "keyword" : "hybrid";
    }
  } catch (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  let experts: HydratedExpert[];
  try {
    experts = await hydrateExperts(admin, candidateIds);
  } catch (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  if (filters.availableNowOnly) {
    experts = experts.filter((e) => e.available_now).slice(offset, offset + limit);
  }

  return Response.json({
    experts,
    mode_requested: requestedMode,
    mode_used: modeUsed,
    query: q,
    next_offset: experts.length === limit ? offset + limit : null,
  });
}

// --------- retrieval modes ----------------------------------------------------

type HardFilters = {
  categoryId: string | null;
  profession: string | null;
  skills: string[];
  minRating: number | null;
  maxRate: number | null;
  verifiedOnly: boolean;
  availableNowOnly: boolean;
  onlineNowOnly: boolean;
  visibilityStates: string[];
};

type Admin = ReturnType<typeof createAdminClient>;

function searchSqlPageSize(
  availableNowOnly: boolean,
  limit: number,
  offset: number,
  extra = 0,
): { sqlLimit: number; sqlOffset: number } {
  if (!availableNowOnly) {
    return { sqlLimit: limit + extra, sqlOffset: offset };
  }
  return {
    sqlLimit: Math.min((limit + offset + extra) * AVAILABLE_NOW_FETCH_MULTIPLIER, MAX_LIMIT),
    sqlOffset: 0,
  };
}

async function runKeywordRetrieval(
  admin: Admin,
  q: string,
  filters: HardFilters,
  limit: number,
  offset: number,
  boostCategoryIds: string[] = [],
): Promise<string[]> {
  const { sqlLimit, sqlOffset } = searchSqlPageSize(filters.availableNowOnly, limit, offset);
  const { data, error } = await admin.rpc("search_experts_keyword", {
    p_q: q || null,
    p_category_id: filters.categoryId,
    p_profession: filters.profession,
    p_skills: filters.skills.length > 0 ? filters.skills : null,
    p_min_rating: filters.minRating,
    p_max_rate: filters.maxRate,
    p_verified_only: filters.verifiedOnly,
    // available_now is derived from the calendar in hydrateExperts, not the DB flag.
    p_available_now_only: false,
    p_online_only: filters.onlineNowOnly,
    p_visibility_states: filters.visibilityStates,
    p_limit: sqlLimit,
    p_offset: sqlOffset,
    p_boost_category_ids: boostCategoryIds.length > 0 ? boostCategoryIds : null,
    p_category_boost: 0.15,
  });
  if (error) throw error;
  return ((data ?? []) as { user_id: string }[]).map((row) => row.user_id);
}

async function runSemanticRetrieval(
  admin: Admin,
  q: string,
  filters: HardFilters,
  limit: number,
  offset: number,
): Promise<{ ids: string[]; fellBack: boolean }> {
  const expansion = await getExpansionForQuery(admin, q);
  if (!expansion) {
    // Bible: on timeout/failure, fall back to keyword with original q.
    return { ids: await runKeywordRetrieval(admin, q, filters, limit, offset), fellBack: true };
  }

  const expandedQuery = buildExpandedQueryString(q, expansion);
  const boostCategoryIds = await resolveCategoryIds(admin, expansion.category_hints);
  const ids = await runKeywordRetrieval(
    admin,
    expandedQuery,
    filters,
    limit,
    offset,
    boostCategoryIds,
  );
  return { ids, fellBack: false };
}

async function runHybridRetrieval(
  admin: Admin,
  q: string,
  filters: HardFilters,
  limit: number,
  offset: number,
): Promise<{ ids: string[]; fellBack: boolean }> {
  // Both legs over-fetch (limit + RRF_OVERFETCH) at offset=0; the RRF merge
  // computes the final ordering across the union, then we slice by offset+limit.
  const { sqlLimit: fetchSize } = searchSqlPageSize(
    filters.availableNowOnly,
    limit,
    offset,
    RRF_OVERFETCH,
  );

  const [keywordIds, semantic] = await Promise.all([
    runKeywordRetrieval(admin, q, filters, fetchSize, 0),
    getExpansionForQuery(admin, q).then(async (expansion) => {
      if (!expansion) return null;
      const expandedQuery = buildExpandedQueryString(q, expansion);
      const boostCategoryIds = await resolveCategoryIds(admin, expansion.category_hints);
      return runKeywordRetrieval(admin, expandedQuery, filters, fetchSize, 0, boostCategoryIds);
    }),
  ]);

  if (!semantic) {
    // Semantic leg failed: fall back to keyword-only ordering.
    const ids = filters.availableNowOnly
      ? keywordIds
      : keywordIds.slice(offset, offset + limit);
    return { ids, fellBack: true };
  }

  const merged = rrfMerge([keywordIds, semantic], RRF_K);
  const ids = filters.availableNowOnly ? merged : merged.slice(offset, offset + limit);
  return { ids, fellBack: false };
}

// --------- helpers -----------------------------------------------------------

/**
 * Reciprocal Rank Fusion. Standard formula: score(d) = Σ 1/(k + rank_i(d)).
 * No custom tuning per Bible. Returns ids ordered by descending RRF score,
 * with stable tie-breakers via the first list's order.
 */
function rrfMerge(rankedLists: string[][], k: number): string[] {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, idx) => {
      const rank = idx + 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  }
  // Tie-breaker: earlier position in the FIRST list (keyword) wins.
  const firstOrder = new Map<string, number>();
  rankedLists[0]?.forEach((id, idx) => firstOrder.set(id, idx));
  return [...scores.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return (firstOrder.get(a[0]) ?? Infinity) - (firstOrder.get(b[0]) ?? Infinity);
    })
    .map(([id]) => id);
}

function buildExpandedQueryString(originalQ: string, expansion: QueryExpansion): string {
  // websearch_to_tsquery treats unquoted whitespace-separated terms as AND.
  // Concatenating the original query with every expansion term therefore
  // produces a MORE restrictive query, not a broader one — a fatal bug for
  // semantic search ("fix a leaky faucet" turns into `fix & leaki & faucet &
  // plumber & ...` which no expert profile satisfies).
  //
  // Bible §"Search engine contract" wants semantic mode to find experts who
  // match ANY of the related terms. We:
  //
  //   1. Treat the original query as one OR-arm (quoted as a phrase so its
  //      tokens still travel together).
  //   2. Add each expansion term as its own OR-arm. Multi-word expansions get
  //      quoted so `websearch_to_tsquery` keeps them as phrases.
  //   3. Include `category_hints` as searchable terms in addition to their
  //      role in the ranking boost — a category name in an expert's bio is
  //      a strong intent signal even when the category_id boost doesn't fire.
  //   4. Deduplicate (case-insensitive) so the OR group stays compact.
  //   5. Strip any embedded double-quotes from terms so we don't break the
  //      parser; OpenAI never produces them in practice but be defensive.
  const rawTerms = [
    originalQ,
    ...expansion.keyword_expansions,
    ...expansion.skill_hints,
    ...expansion.category_hints,
  ];

  const seen = new Set<string>();
  const arms: string[] = [];
  for (const raw of rawTerms) {
    const cleaned = (raw ?? "").replace(/"/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    arms.push(/\s/.test(cleaned) ? `"${cleaned}"` : cleaned);
  }

  if (arms.length === 0) return originalQ;
  return arms.join(" OR ");
}

async function resolveCategoryIds(admin: Admin, categoryNames: string[]): Promise<string[]> {
  if (categoryNames.length === 0) return [];
  const { data, error } = await admin
    .from("categories")
    .select("category_id, name")
    .in(
      "name",
      categoryNames.map((n) => n.trim()).filter(Boolean),
    );
  if (error || !data) return [];
  return data.map((c) => String(c.category_id));
}
