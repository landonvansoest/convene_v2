-- 039_expert_search_vector.sql
-- Populate and maintain public.expert_profiles.search_vector so the FTS-based
-- search engine contract from the Bible can do server-side keyword/FTS
-- retrieval. The column and GIN index were added back in 002_core_schema.sql
-- but nothing has ever written to them.
--
-- The "search document" per Bible §"Search engine contract" must cover:
--   A (highest weight) : profession (users.profession), category name
--   B                  : skills_specializations tags (each independently)
--   C                  : qualifications, expert_bio, about_services
--
-- profile_embedding / embedding_updated_at remain reserved for future vector
-- retrieval. The Bible's "semantic" mode is implemented as OpenAI query
-- expansion + FTS, NOT vector cosine — see chunk 3 of this rollout.

-- Recompute the FTS vector for one expert row. Used by INSERT/UPDATE triggers
-- on expert_profiles and the joined-table triggers below.
CREATE OR REPLACE FUNCTION public.compute_expert_profile_search_vector(p_user_id uuid)
RETURNS tsvector
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_profession text;
  v_category   text;
  v_skills     text;
  v_quals      text;
  v_bio        text;
  v_services   text;
  v_doc        tsvector;
BEGIN
  SELECT u.profession
    INTO v_profession
    FROM public.users u
   WHERE u.user_id = p_user_id;

  SELECT
    coalesce(array_to_string(ep.skills_specializations, ' '), ''),
    coalesce(ep.qualifications, ''),
    coalesce(ep.expert_bio, ''),
    coalesce(ep.about_services, ''),
    c.name
    INTO v_skills, v_quals, v_bio, v_services, v_category
    FROM public.expert_profiles ep
    LEFT JOIN public.categories c ON c.category_id = ep.category_id
   WHERE ep.user_id = p_user_id;

  v_doc :=
       setweight(to_tsvector('english', coalesce(v_profession, '')), 'A')
    || setweight(to_tsvector('english', coalesce(v_category,   '')), 'A')
    || setweight(to_tsvector('english', coalesce(v_skills,     '')), 'B')
    || setweight(to_tsvector('english', coalesce(v_quals,      '')), 'C')
    || setweight(to_tsvector('english', coalesce(v_bio,        '')), 'C')
    || setweight(to_tsvector('english', coalesce(v_services,   '')), 'C');

  RETURN v_doc;
END;
$$;

COMMENT ON FUNCTION public.compute_expert_profile_search_vector(uuid) IS
  'Builds the weighted tsvector "search document" for one expert per Bible search engine contract. A=profession+category, B=skills, C=qualifications+bio+services.';

-- Trigger on expert_profiles: recompute whenever any of the searchable
-- columns change. We rewrite NEW.search_vector in BEFORE INSERT/UPDATE so the
-- value lands in the same row write — no second UPDATE needed.
CREATE OR REPLACE FUNCTION public.tg_expert_profiles_refresh_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := public.compute_expert_profile_search_vector(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expert_profiles_search_vector_refresh ON public.expert_profiles;
CREATE TRIGGER expert_profiles_search_vector_refresh
BEFORE INSERT OR UPDATE OF category_id, qualifications, expert_bio, about_services, skills_specializations
ON public.expert_profiles
FOR EACH ROW
EXECUTE FUNCTION public.tg_expert_profiles_refresh_search_vector();

-- Trigger on users: profession lives on users, not expert_profiles. Recompute
-- this user's expert row when profession changes. No-op if the user has no
-- expert_profiles row.
CREATE OR REPLACE FUNCTION public.tg_users_refresh_expert_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(NEW.profession, '') IS DISTINCT FROM coalesce(OLD.profession, '') THEN
    UPDATE public.expert_profiles
       SET search_vector = public.compute_expert_profile_search_vector(NEW.user_id)
     WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_profession_refresh_search_vector ON public.users;
CREATE TRIGGER users_profession_refresh_search_vector
AFTER UPDATE OF profession ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.tg_users_refresh_expert_search_vector();

-- Trigger on categories: when an admin renames a category, every expert in
-- that category needs their search_vector recomputed so the new name is
-- searchable. Cheap because category renames are rare.
CREATE OR REPLACE FUNCTION public.tg_categories_refresh_expert_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(NEW.name, '') IS DISTINCT FROM coalesce(OLD.name, '') THEN
    UPDATE public.expert_profiles ep
       SET search_vector = public.compute_expert_profile_search_vector(ep.user_id)
     WHERE ep.category_id = NEW.category_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS categories_name_refresh_expert_search_vector ON public.categories;
CREATE TRIGGER categories_name_refresh_expert_search_vector
AFTER UPDATE OF name ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.tg_categories_refresh_expert_search_vector();

-- Backfill every existing expert row exactly once. After this, the BEFORE
-- INSERT/UPDATE trigger keeps things in sync.
UPDATE public.expert_profiles ep
   SET search_vector = public.compute_expert_profile_search_vector(ep.user_id);

-- The GIN index from 002_core_schema.sql is already in place:
--   CREATE INDEX expert_profiles_search_vector_idx
--     ON public.expert_profiles USING gin (search_vector);
-- Nothing to add here. ts_rank_cd uses the index automatically on @@ queries.
