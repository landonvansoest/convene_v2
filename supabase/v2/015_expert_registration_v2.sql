-- Expert registration v2: feedback capture + membership tier rename.

CREATE TABLE IF NOT EXISTS public.user_feedback (
  feedback_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users (user_id) ON DELETE SET NULL,
  feedback_type text NOT NULL,
  feedback_text text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_feedback_user_idx
  ON public.user_feedback (user_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expert_profiles'
      AND column_name = 'is_verified'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expert_profiles'
      AND column_name = 'membership_tier'
  ) THEN
    ALTER TABLE public.expert_profiles RENAME COLUMN is_verified TO membership_tier;
    ALTER TABLE public.expert_profiles
      ALTER COLUMN membership_tier TYPE text
      USING (CASE WHEN membership_tier IS TRUE THEN 'verified' ELSE 'free' END);
    ALTER TABLE public.expert_profiles
      ALTER COLUMN membership_tier SET DEFAULT 'free',
      ALTER COLUMN membership_tier SET NOT NULL;
  END IF;
END $$;

ALTER TABLE public.expert_profiles
  ADD COLUMN IF NOT EXISTS registration_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_submitted_at timestamptz;

