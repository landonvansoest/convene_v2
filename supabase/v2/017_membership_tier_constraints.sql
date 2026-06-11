-- Enforce valid membership tiers and optional per-user pricing override.

ALTER TABLE public.expert_profiles
  ADD COLUMN IF NOT EXISTS membership_price_override_cents integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expert_profiles_membership_tier_chk'
      AND conrelid = 'public.expert_profiles'::regclass
  ) THEN
    ALTER TABLE public.expert_profiles
      ADD CONSTRAINT expert_profiles_membership_tier_chk
      CHECK (membership_tier IN ('free', 'verified', 'enterprise'));
  END IF;
END $$;

ALTER TABLE public.user_feedback
  ADD COLUMN IF NOT EXISTS feedback_type text,
  ADD COLUMN IF NOT EXISTS feedback_text text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_feedback' AND column_name = 'expert_category_suggestions'
  ) THEN
    UPDATE public.user_feedback
    SET
      feedback_type = COALESCE(feedback_type, 'expert_category_suggestion'),
      feedback_text = COALESCE(feedback_text, expert_category_suggestions)
    WHERE feedback_text IS NULL OR feedback_type IS NULL;
  END IF;
END $$;

UPDATE public.user_feedback
SET
  feedback_type = COALESCE(feedback_type, 'general'),
  feedback_text = COALESCE(feedback_text, '')
WHERE feedback_type IS NULL OR feedback_text IS NULL;

ALTER TABLE public.user_feedback
  ALTER COLUMN feedback_type SET NOT NULL,
  ALTER COLUMN feedback_text SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expert_profiles_membership_price_override_chk'
      AND conrelid = 'public.expert_profiles'::regclass
  ) THEN
    ALTER TABLE public.expert_profiles
      ADD CONSTRAINT expert_profiles_membership_price_override_chk
      CHECK (membership_price_override_cents IS NULL OR membership_price_override_cents >= 0);
  END IF;
END $$;
