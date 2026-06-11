-- 041_search_query_expansion_cache.sql
-- Backing store for OpenAI query-expansion results (Bible §"Search engine
-- contract" → Semantic query expansion → Caching).
--
-- Two rules from the Bible drive this design:
--   1. Cache lookups MUST be keyed on (normalized_user_query, locale,
--      mode_version) so we never call OpenAI twice for the same input.
--   2. Cached expansions MUST refresh when FAQs, categories, or any
--      searchable profile field changes. We implement that by bumping a
--      single integer `mode_version` on a settings row — every cache entry
--      is keyed on that version, so a bump effectively invalidates every
--      row. New searches re-populate as they come in.
--
-- On top of (2), a 30-day soft TTL prevents un-bumped rows from sitting
-- forever as content drifts.

CREATE TABLE IF NOT EXISTS public.search_settings (
  id           int          PRIMARY KEY,
  mode_version int          NOT NULL DEFAULT 1,
  updated_at   timestamptz  NOT NULL DEFAULT now()
);

INSERT INTO public.search_settings (id, mode_version)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.search_settings IS
  'Singleton (id=1) holding the current mode_version that keys the query-expansion cache. Bumped by triggers on any input that influences expansion output.';

CREATE TABLE IF NOT EXISTS public.search_query_expansion_cache (
  q_normalized text        NOT NULL,
  locale       text        NOT NULL DEFAULT 'en',
  mode_version int         NOT NULL,
  payload      jsonb       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (q_normalized, locale, mode_version)
);

CREATE INDEX IF NOT EXISTS search_query_expansion_cache_created_at_idx
  ON public.search_query_expansion_cache (created_at);

COMMENT ON TABLE public.search_query_expansion_cache IS
  'OpenAI query-expansion payloads keyed on (normalized query, locale, mode_version). Soft 30-day TTL applied at read time; hard invalidation via mode_version bumps from FAQ/category/profile-field changes.';

COMMENT ON COLUMN public.search_query_expansion_cache.payload IS
  'JSON expansion: { category_hints: string[], keyword_expansions: string[], skill_hints: string[], confidence: number }';

-- Helper: bump mode_version. AFTER triggers below all call this so the
-- bump-on-change logic stays in one place.
CREATE OR REPLACE FUNCTION public.bump_search_mode_version()
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.search_settings
     SET mode_version = mode_version + 1,
         updated_at   = now()
   WHERE id = 1;
$$;

COMMENT ON FUNCTION public.bump_search_mode_version() IS
  'Increment search_settings.mode_version so all rows in search_query_expansion_cache become stale by their composite PK.';

-- ---- Invalidation triggers ----------------------------------------------

-- FAQs influence "FAQ-driven intent matches" — bump on any change.
-- Guarded so this migration can run on a DB where 033_faqs.sql hasn't been
-- applied yet; when faqs ships later, re-run 041 (or apply 033 then 041) to
-- attach the trigger.
CREATE OR REPLACE FUNCTION public.tg_faqs_bump_search_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.bump_search_mode_version();
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'faqs' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS faqs_bump_search_mode_version ON public.faqs';
    EXECUTE $sql$
      CREATE TRIGGER faqs_bump_search_mode_version
      AFTER INSERT OR UPDATE OR DELETE ON public.faqs
      FOR EACH ROW
      EXECUTE FUNCTION public.tg_faqs_bump_search_version()
    $sql$;
  ELSE
    RAISE NOTICE 'skipping faqs_bump_search_mode_version trigger: public.faqs does not exist (run 033_faqs.sql then re-run 041 to attach).';
  END IF;
END $$;

-- Category name/parent changes influence category_hints resolution.
CREATE OR REPLACE FUNCTION public.tg_categories_bump_search_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.bump_search_mode_version();
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS categories_bump_search_mode_version ON public.categories;
CREATE TRIGGER categories_bump_search_mode_version
AFTER INSERT OR UPDATE OR DELETE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.tg_categories_bump_search_version();

-- expert_profiles searchable fields drive expansion quality. Only bump when
-- a search-relevant column actually changes so routine updates (timestamps,
-- counters) don't blow the whole cache.
CREATE OR REPLACE FUNCTION public.tg_expert_profiles_bump_search_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.bump_search_mode_version();
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS expert_profiles_bump_search_mode_version ON public.expert_profiles;
CREATE TRIGGER expert_profiles_bump_search_mode_version
AFTER INSERT
    OR DELETE
    OR UPDATE OF category_id, qualifications, expert_bio, about_services, skills_specializations
ON public.expert_profiles
FOR EACH ROW
EXECUTE FUNCTION public.tg_expert_profiles_bump_search_version();

-- users.profession is part of the search document. Only bump on profession
-- changes to avoid invalidating every time someone updates their photo.
CREATE OR REPLACE FUNCTION public.tg_users_profession_bump_search_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(NEW.profession, '') IS DISTINCT FROM coalesce(OLD.profession, '') THEN
    PERFORM public.bump_search_mode_version();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_profession_bump_search_mode_version ON public.users;
CREATE TRIGGER users_profession_bump_search_mode_version
AFTER UPDATE OF profession ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.tg_users_profession_bump_search_version();
