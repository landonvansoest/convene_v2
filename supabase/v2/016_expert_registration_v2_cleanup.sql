-- Cleanup for early expert registration v2 draft schema.
-- Safe to run whether or not 015 (old/new) was applied.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expert_profiles' AND column_name = 'is_verified'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expert_profiles' AND column_name = 'membership_tier'
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
  DROP COLUMN IF EXISTS qualifications_list;

ALTER TABLE public.expert_availability
  DROP COLUMN IF EXISTS package_enabled,
  DROP COLUMN IF EXISTS package_require_purchase,
  DROP COLUMN IF EXISTS package_session_count,
  DROP COLUMN IF EXISTS package_session_duration_minutes,
  DROP COLUMN IF EXISTS package_discount_type,
  DROP COLUMN IF EXISTS package_discount_value,
  DROP COLUMN IF EXISTS package_fixed_price;

DROP TABLE IF EXISTS public.expert_registration_drafts;
