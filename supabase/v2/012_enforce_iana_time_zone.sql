-- Enforce canonical IANA time zone IDs in users.time_zone.
-- This is the safest format for DST-aware scheduling and display.

CREATE OR REPLACE FUNCTION public.is_valid_iana_timezone(tz text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_timezone_names
    WHERE name = tz
  );
$$;

CREATE OR REPLACE FUNCTION public.users_validate_time_zone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.time_zone IS NULL OR btrim(NEW.time_zone) = '' THEN
    NEW.time_zone := 'UTC';
  END IF;

  -- Normalize common legacy alias
  IF NEW.time_zone = 'Etc/UTC' THEN
    NEW.time_zone := 'UTC';
  END IF;

  IF NOT public.is_valid_iana_timezone(NEW.time_zone) THEN
    RAISE EXCEPTION 'Invalid IANA time zone: %', NEW.time_zone
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill invalid historical values to UTC so the trigger can enforce forward.
UPDATE public.users
SET time_zone = 'UTC'
WHERE time_zone IS NULL
   OR btrim(time_zone) = ''
   OR NOT public.is_valid_iana_timezone(time_zone);

DROP TRIGGER IF EXISTS users_validate_time_zone_trg ON public.users;
CREATE TRIGGER users_validate_time_zone_trg
BEFORE INSERT OR UPDATE OF time_zone
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.users_validate_time_zone();
