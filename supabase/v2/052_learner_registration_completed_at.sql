-- Track learner registration wizard completion separately from convene_role_mode,
-- which defaults to 'learner' on every new public.users row and cannot be used
-- as a "wizard finished" signal.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS learner_registration_completed_at timestamptz;

COMMENT ON COLUMN public.users.learner_registration_completed_at IS
  'Set when the learner completes /auth/callback/signup (wizard step 6 or manual submit). NULL = wizard still required.';

-- Backfill users who already finished the wizard (hometown is required on step 4+).
UPDATE public.users
SET learner_registration_completed_at = COALESCE(updated_at, created_at, now())
WHERE learner_registration_completed_at IS NULL
  AND hometown IS NOT NULL
  AND btrim(hometown) <> '';
