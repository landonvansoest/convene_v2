-- Add role mode selection for dual-role accounts.
-- Product rule:
-- - Users with an expert profile should default to `expert`.
-- - User may manually switch to `learner`.

DO $$
BEGIN
  CREATE TYPE convene_role_mode AS ENUM ('learner', 'expert');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS convene_role_mode convene_role_mode;

ALTER TABLE public.users
  ALTER COLUMN convene_role_mode SET DEFAULT 'learner';

-- Backfill: existing expert-profile users default to expert.
UPDATE public.users
SET convene_role_mode = CASE
  WHEN has_expert_profile THEN 'expert'::convene_role_mode
  ELSE 'learner'::convene_role_mode
END;

ALTER TABLE public.users
  ALTER COLUMN convene_role_mode SET NOT NULL;

CREATE OR REPLACE FUNCTION public.users_default_role_mode_from_expert_flag()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If user has no expert profile, force learner mode.
  IF NEW.has_expert_profile IS FALSE THEN
    NEW.convene_role_mode := 'learner'::convene_role_mode;
    RETURN NEW;
  END IF;

  -- If expert profile exists and role mode not explicitly set, default to expert.
  IF NEW.has_expert_profile IS TRUE AND NEW.convene_role_mode IS NULL THEN
    NEW.convene_role_mode := 'expert'::convene_role_mode;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_default_role_mode_from_expert_flag_trg ON public.users;
CREATE TRIGGER users_default_role_mode_from_expert_flag_trg
BEFORE INSERT OR UPDATE OF has_expert_profile, convene_role_mode
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.users_default_role_mode_from_expert_flag();

