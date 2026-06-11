-- 042_search_experts_keyword_with_boost.sql
-- Extends 040's search_experts_keyword to accept an optional category boost.
--
-- Bible §"Search engine contract" allows a mild ranking boost for experts
-- whose category_id matches a FAQ-derived category_hint coming out of OpenAI
-- query expansion. We implement that boost as an additive bump to the
-- ts_rank_cd relevance score so it composes naturally with the existing
-- ordering and never overrides hard filters.
--
-- PostgreSQL cannot CREATE OR REPLACE a function whose argument list changes,
-- so we DROP the old one explicitly and recreate it with the extra params at
-- the end. JS callers that don't need the boost can omit them and get the
-- previous behavior.

DROP FUNCTION IF EXISTS public.search_experts_keyword(
  text, uuid, text, text[], numeric, numeric, boolean, boolean, boolean, text[], int, int
);

CREATE OR REPLACE FUNCTION public.search_experts_keyword(
  p_q                    text,
  p_category_id          uuid     DEFAULT NULL,
  p_profession           text     DEFAULT NULL,
  p_skills               text[]   DEFAULT NULL,
  p_min_rating           numeric  DEFAULT NULL,
  p_max_rate             numeric  DEFAULT NULL,
  p_verified_only        boolean  DEFAULT false,
  p_available_now_only   boolean  DEFAULT false,
  p_online_only          boolean  DEFAULT false,
  p_visibility_states    text[]   DEFAULT ARRAY['visible_active']::text[],
  p_limit                int      DEFAULT 50,
  p_offset               int      DEFAULT 0,
  p_boost_category_ids   uuid[]   DEFAULT NULL,
  p_category_boost       real     DEFAULT 0.15
)
RETURNS TABLE (
  user_id   uuid,
  relevance real,
  has_match boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT CASE
      WHEN nullif(trim(coalesce(p_q, '')), '') IS NULL THEN NULL
      ELSE websearch_to_tsquery('english', p_q)
    END AS tsq
  ),
  candidates AS (
    SELECT
      ep.user_id,
      ep.search_vector,
      ep.skills_specializations,
      ep.category_id,
      ep.membership_tier,
      ep.expert_dependability_rating,
      u.profession,
      u.online,
      u.last_seen_at,
      ea.rate,
      ea.available_now
    FROM public.expert_profiles ep
    LEFT JOIN public.users u             ON u.user_id  = ep.user_id
    LEFT JOIN public.expert_availability ea ON ea.user_id = ep.user_id
    WHERE ep.expert_visibility_state::text = ANY(p_visibility_states)
      AND (p_category_id   IS NULL OR ep.category_id = p_category_id)
      AND (p_profession    IS NULL OR u.profession ILIKE '%' || p_profession || '%')
      AND (p_skills        IS NULL OR cardinality(p_skills) = 0 OR ep.skills_specializations && p_skills)
      AND (NOT p_verified_only      OR ep.membership_tier IN ('verified', 'enterprise'))
      AND (NOT p_available_now_only OR ea.available_now IS TRUE)
      AND (NOT p_online_only        OR (u.online IS TRUE AND u.last_seen_at >= now() - interval '5 minutes'))
      AND (p_max_rate IS NULL OR ea.rate IS NULL OR ea.rate <= p_max_rate)
  ),
  scored AS (
    SELECT
      c.user_id,
      c.category_id,
      c.membership_tier,
      c.expert_dependability_rating,
      CASE WHEN q.tsq IS NULL THEN 0::real ELSE ts_rank_cd(c.search_vector, q.tsq) END
        + CASE
            WHEN p_boost_category_ids IS NOT NULL
              AND cardinality(p_boost_category_ids) > 0
              AND c.category_id = ANY(p_boost_category_ids)
            THEN p_category_boost
            ELSE 0::real
          END
        AS relevance,
      (q.tsq IS NOT NULL AND c.search_vector @@ q.tsq) AS has_match,
      coalesce((
        SELECT avg(r.overall_rating)::numeric
        FROM public.reviews_of_experts r
        WHERE r.expert_reviewee_id = c.user_id
      ), 0) AS avg_rating
    FROM candidates c
    CROSS JOIN q
  )
  SELECT user_id, relevance, has_match
  FROM scored
  WHERE (p_min_rating IS NULL OR avg_rating >= p_min_rating)
    AND ( (SELECT tsq FROM q) IS NULL OR has_match )
  ORDER BY
    relevance                                                           DESC NULLS LAST,
    CASE WHEN membership_tier IN ('verified','enterprise') THEN 1 ELSE 0 END DESC,
    avg_rating                                                          DESC NULLS LAST,
    coalesce(expert_dependability_rating, 0)                            DESC,
    user_id ASC
  LIMIT  p_limit
  OFFSET greatest(p_offset, 0);
$$;

COMMENT ON FUNCTION public.search_experts_keyword(
  text, uuid, text, text[], numeric, numeric, boolean, boolean, boolean, text[], int, int, uuid[], real
) IS
  'Bible §"Search engine contract" — keyword/FTS retrieval with optional FAQ-derived category boost. Used by mode=keyword (no boost), mode=semantic and mode=hybrid (with boost from OpenAI category_hints).';

GRANT EXECUTE ON FUNCTION public.search_experts_keyword(
  text, uuid, text, text[], numeric, numeric, boolean, boolean, boolean, text[], int, int, uuid[], real
) TO anon, authenticated, service_role;
