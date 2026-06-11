-- Align users/expert_profiles with Bible + operator decisions.
-- - users.full_name is derived (generated) from first_name + last_name
-- - users.time_zone is auto-derived from hometown (best effort) and guaranteed non-null
-- - profile_visibility_state moves from users -> expert_profiles

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS full_name text GENERATED ALWAYS AS (
    NULLIF(
      btrim(
        CASE
          WHEN first_name IS NULL OR first_name = '' THEN coalesce(last_name, '')
          WHEN last_name IS NULL OR last_name = '' THEN first_name
          ELSE first_name || ' ' || last_name
        END
      ),
      ''
    )
  ) STORED;

CREATE OR REPLACE FUNCTION public.derive_timezone_from_hometown(h text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := lower(coalesce(h, ''));
BEGIN
  -- Best-effort city matching. App can still supply explicit IANA zone.
  IF v = '' THEN RETURN 'UTC'; END IF;
  IF v LIKE '%new york%' OR v LIKE '%boston%' OR v LIKE '%miami%' THEN RETURN 'America/New_York'; END IF;
  IF v LIKE '%chicago%' OR v LIKE '%dallas%' OR v LIKE '%houston%' THEN RETURN 'America/Chicago'; END IF;
  IF v LIKE '%denver%' OR v LIKE '%phoenix%' THEN RETURN 'America/Denver'; END IF;
  IF v LIKE '%los angeles%' OR v LIKE '%san francisco%' OR v LIKE '%seattle%' THEN RETURN 'America/Los_Angeles'; END IF;
  IF v LIKE '%london%' THEN RETURN 'Europe/London'; END IF;
  IF v LIKE '%paris%' OR v LIKE '%berlin%' OR v LIKE '%madrid%' THEN RETURN 'Europe/Paris'; END IF;
  IF v LIKE '%tokyo%' THEN RETURN 'Asia/Tokyo'; END IF;
  IF v LIKE '%sydney%' OR v LIKE '%melbourne%' THEN RETURN 'Australia/Sydney'; END IF;
  RETURN 'UTC';
END;
$$;

CREATE OR REPLACE FUNCTION public.users_set_timezone_from_hometown()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.time_zone IS NULL OR btrim(NEW.time_zone) = '' THEN
    NEW.time_zone := public.derive_timezone_from_hometown(NEW.hometown);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_timezone_from_hometown_trg ON public.users;
CREATE TRIGGER users_set_timezone_from_hometown_trg
BEFORE INSERT OR UPDATE OF hometown, time_zone
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.users_set_timezone_from_hometown();

UPDATE public.users
SET time_zone = public.derive_timezone_from_hometown(hometown)
WHERE time_zone IS NULL OR btrim(time_zone) = '';

ALTER TABLE public.users
  ALTER COLUMN time_zone SET DEFAULT 'UTC',
  ALTER COLUMN time_zone SET NOT NULL;

ALTER TABLE public.expert_profiles
  ADD COLUMN IF NOT EXISTS profile_visibility_state profile_visibility_state NOT NULL DEFAULT 'expert_hidden_incomplete_fields',
  ADD COLUMN IF NOT EXISTS full_name text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'profile_visibility_state'
  ) THEN
    UPDATE public.expert_profiles ep
    SET profile_visibility_state = CASE
      WHEN u.profile_visibility_state IN (
        'visible',
        'expert_pending_admin_review',
        'expert_hidden_incomplete_fields',
        'expert_hidden_payment_setup_incomplete',
        'hidden_unknown_or_error'
      ) THEN u.profile_visibility_state
      WHEN ep.expert_status = 'active' THEN 'visible'
      WHEN ep.expert_status = 'pending' THEN 'expert_pending_admin_review'
      ELSE 'expert_hidden_incomplete_fields'
    END
    FROM public.users u
    WHERE u.user_id = ep.user_id;
  ELSE
    -- Re-runnable fallback when users.profile_visibility_state is already dropped:
    -- derive expert visibility from expert_status for legacy rows.
    UPDATE public.expert_profiles ep
    SET profile_visibility_state = CASE
      WHEN ep.expert_status = 'active' THEN 'visible'
      WHEN ep.expert_status = 'pending' THEN 'expert_pending_admin_review'
      ELSE 'expert_hidden_incomplete_fields'
    END
    WHERE ep.profile_visibility_state IS DISTINCT FROM CASE
      WHEN ep.expert_status = 'active' THEN 'visible'
      WHEN ep.expert_status = 'pending' THEN 'expert_pending_admin_review'
      ELSE 'expert_hidden_incomplete_fields'
    END;
  END IF;
END $$;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS profile_visibility_state;

DROP VIEW IF EXISTS public.expert_profiles_with_full_name;

UPDATE public.expert_profiles ep
SET full_name = u.full_name
FROM public.users u
WHERE u.user_id = ep.user_id
  AND ep.full_name IS DISTINCT FROM u.full_name;

CREATE OR REPLACE FUNCTION public.expert_profiles_set_full_name_from_user()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT u.full_name
  INTO NEW.full_name
  FROM public.users u
  WHERE u.user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expert_profiles_set_full_name_trg ON public.expert_profiles;
CREATE TRIGGER expert_profiles_set_full_name_trg
BEFORE INSERT OR UPDATE OF user_id, full_name
ON public.expert_profiles
FOR EACH ROW
EXECUTE FUNCTION public.expert_profiles_set_full_name_from_user();

CREATE OR REPLACE FUNCTION public.users_sync_expert_profile_full_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.expert_profiles ep
  SET full_name = NEW.full_name
  WHERE ep.user_id = NEW.user_id
    AND ep.full_name IS DISTINCT FROM NEW.full_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_sync_expert_profile_full_name_trg ON public.users;
CREATE TRIGGER users_sync_expert_profile_full_name_trg
AFTER INSERT OR UPDATE OF first_name, last_name
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.users_sync_expert_profile_full_name();
