-- Denormalized full_name on expert_availability for ops/reporting; always mirrors users.full_name.

ALTER TABLE public.expert_availability
  ADD COLUMN IF NOT EXISTS full_name text;

COMMENT ON COLUMN public.expert_availability.full_name IS 'Copy of users.full_name; set only by triggers (not application updates).';

UPDATE public.expert_availability ea
SET full_name = u.full_name
FROM public.users u
WHERE u.user_id = ea.user_id
  AND ea.full_name IS DISTINCT FROM u.full_name;

CREATE OR REPLACE FUNCTION public.expert_availability_set_full_name_from_user()
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

DROP TRIGGER IF EXISTS expert_availability_set_full_name_trg ON public.expert_availability;
CREATE TRIGGER expert_availability_set_full_name_trg
BEFORE INSERT OR UPDATE
ON public.expert_availability
FOR EACH ROW
EXECUTE FUNCTION public.expert_availability_set_full_name_from_user();

CREATE OR REPLACE FUNCTION public.users_sync_expert_availability_full_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.expert_availability ea
  SET full_name = NEW.full_name
  WHERE ea.user_id = NEW.user_id
    AND ea.full_name IS DISTINCT FROM NEW.full_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_sync_expert_availability_full_name_trg ON public.users;
CREATE TRIGGER users_sync_expert_availability_full_name_trg
AFTER INSERT OR UPDATE OF first_name, last_name
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.users_sync_expert_availability_full_name();
