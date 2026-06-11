import { getOpenAiClient } from "@/lib/openai/server";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Bible §"Search engine contract" → Semantic query expansion (OpenAI API +
 * caching + timeout). This file owns:
 *
 *   1. Normalizing the user's query so equivalent inputs share a cache row.
 *   2. Reading mode_version from search_settings + looking up cache.
 *   3. Calling OpenAI with a 10s hard timeout and JSON-only output.
 *   4. Persisting fresh results.
 *   5. Returning null on any error so callers can fall back to keyword.
 *
 * The model is gpt-4o-mini — cheapest tier that supports response_format
 * json_schema and is reliably fast under the 10s budget.
 */

type Admin = ReturnType<typeof createAdminClient>;

const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = 10_000;
const CACHE_SOFT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type QueryExpansion = {
  category_hints: string[];
  keyword_expansions: string[];
  skill_hints: string[];
  confidence: number;
};

export function normalizeSearchQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Top-level entry point used by /api/search/experts in semantic/hybrid mode.
 * Returns null on cache miss + OpenAI failure/timeout — callers must fall
 * back to keyword retrieval in that case.
 */
export async function getExpansionForQuery(
  admin: Admin,
  rawQuery: string,
  locale = "en",
): Promise<QueryExpansion | null> {
  const q = normalizeSearchQuery(rawQuery);
  if (!q) return null;

  const modeVersion = await readModeVersion(admin);

  const cached = await readCache(admin, q, locale, modeVersion);
  if (cached) return cached;

  const fresh = await callOpenAiExpansion(admin, q);
  if (!fresh) return null;

  await writeCache(admin, q, locale, modeVersion, fresh);
  return fresh;
}

async function readModeVersion(admin: Admin): Promise<number> {
  const { data, error } = await admin
    .from("search_settings")
    .select("mode_version")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return 1;
  return Number(data.mode_version) || 1;
}

async function readCache(
  admin: Admin,
  qNormalized: string,
  locale: string,
  modeVersion: number,
): Promise<QueryExpansion | null> {
  const { data, error } = await admin
    .from("search_query_expansion_cache")
    .select("payload, created_at")
    .eq("q_normalized", qNormalized)
    .eq("locale", locale)
    .eq("mode_version", modeVersion)
    .maybeSingle();
  if (error || !data) return null;

  // Soft TTL: 30-day floor on top of mode_version invalidation. If older,
  // treat as a miss so we refresh against current FAQ/category state.
  const createdAt = data.created_at ? Date.parse(String(data.created_at)) : 0;
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > CACHE_SOFT_TTL_MS) {
    return null;
  }

  return coerceExpansionPayload(data.payload);
}

async function writeCache(
  admin: Admin,
  qNormalized: string,
  locale: string,
  modeVersion: number,
  payload: QueryExpansion,
): Promise<void> {
  const { error } = await admin
    .from("search_query_expansion_cache")
    .upsert(
      {
        q_normalized: qNormalized,
        locale,
        mode_version: modeVersion,
        payload: payload as unknown as Record<string, unknown>,
        created_at: new Date().toISOString(),
      },
      { onConflict: "q_normalized,locale,mode_version" },
    );
  if (error) {
    // Cache write is best-effort; never fail the search.
    console.warn("[search/queryExpansion] cache write failed:", error.message);
  }
}

/**
 * Call OpenAI with a 10s hard timeout (Bible). Returns the structured payload
 * on success, null on timeout, parse failure, or missing API key.
 */
async function callOpenAiExpansion(
  admin: Admin,
  qNormalized: string,
): Promise<QueryExpansion | null> {
  const client = getOpenAiClient();
  if (!client) return null;

  const [categoryNames, faqDigest] = await Promise.all([
    fetchCategoryNames(admin),
    fetchFaqDigest(admin),
  ]);

  const system = [
    "You expand short user search queries for a marketplace of one-on-one expert sessions.",
    "Output ONLY a JSON object matching the supplied schema. No prose, no extra fields.",
    "category_hints: zero or more EXACT category names from the provided list that the query implies.",
    "keyword_expansions: up to 10 synonyms / related single terms or short phrases a user might use.",
    "skill_hints: up to 10 likely specific skills or tags relevant to fulfilling the request.",
    "confidence: 0..1, your honest belief the expansion will help.",
    "Use the FAQ entries to ground hints when they reference experts, categories, or services.",
    "If the query is too vague to expand, return empty arrays and confidence near 0.",
  ].join("\n");

  const user = [
    `User query: ${JSON.stringify(qNormalized)}`,
    `Available categories: ${JSON.stringify(categoryNames)}`,
    `FAQ entries: ${JSON.stringify(faqDigest)}`,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await client.chat.completions.create(
      {
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "search_query_expansion",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["category_hints", "keyword_expansions", "skill_hints", "confidence"],
              properties: {
                category_hints: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 16,
                },
                keyword_expansions: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 10,
                },
                skill_hints: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 10,
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
            },
          },
        },
        temperature: 0.2,
      },
      { signal: controller.signal },
    );
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    return coerceExpansionPayload(JSON.parse(content));
  } catch (err) {
    // Timeout, network error, parse error, or missing key — all fall back.
    console.warn(
      "[search/queryExpansion] OpenAI expansion failed (falling back to keyword):",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCategoryNames(admin: Admin): Promise<string[]> {
  const { data, error } = await admin
    .from("categories")
    .select("name")
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((c) => String(c.name)).filter(Boolean);
}

/**
 * Compact list of published FAQs so the model can use them to derive
 * category_hints per Bible §"FAQ-driven intent matches". Kept small so we
 * don't blow up token cost on every miss.
 */
async function fetchFaqDigest(
  admin: Admin,
): Promise<{ q: string; a: string }[]> {
  const { data, error } = await admin
    .from("faqs")
    .select("question, answer")
    .eq("is_published", true)
    .order("display_order", { ascending: true })
    .limit(20);
  if (error || !data) return [];
  return data.map((row) => ({
    q: String(row.question ?? "").slice(0, 200),
    a: String(row.answer ?? "").slice(0, 400),
  }));
}

function coerceExpansionPayload(raw: unknown): QueryExpansion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim())
      : [];
  const confidence = typeof r.confidence === "number" ? r.confidence : 0;
  return {
    category_hints: asStringArray(r.category_hints).slice(0, 16),
    keyword_expansions: asStringArray(r.keyword_expansions).slice(0, 10),
    skill_hints: asStringArray(r.skill_hints).slice(0, 10),
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}
