-- Merge expert_status + profile_visibility_state into a single expert_visibility_state enum.

DO $$ BEGIN
  CREATE TYPE public.expert_visibility_state AS ENUM (
    'visible_active',
    'visible_temp',
    'pending_admin_review',
    'hidden_incomplete_fields',
    'hidden_payment_incomplete',
    'hidden_unknown_or_error',
    'hidden_by_user'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expert_profiles'
      AND column_name = 'expert_status'
  ) THEN
    ALTER TABLE public.expert_profiles
      ADD COLUMN IF NOT EXISTS expert_visibility_state public.expert_visibility_state;

    UPDATE public.expert_profiles ep
    SET expert_visibility_state = CASE
      WHEN ep.expert_status = 'pending'
        OR ep.profile_visibility_state = 'expert_pending_admin_review'::profile_visibility_state
        THEN 'pending_admin_review'::public.expert_visibility_state
      WHEN ep.expert_status = 'temp' THEN 'visible_temp'::public.expert_visibility_state
      WHEN ep.profile_visibility_state = 'expert_hidden_payment_setup_incomplete'::profile_visibility_state
        THEN 'hidden_payment_incomplete'::public.expert_visibility_state
      WHEN ep.profile_visibility_state IN (
        'expert_hidden_incomplete_fields'::profile_visibility_state,
        'learner_hidden_incomplete_fields'::profile_visibility_state,
        'learner_hidden_email_unverified'::profile_visibility_state
      ) THEN 'hidden_incomplete_fields'::public.expert_visibility_state
      WHEN ep.profile_visibility_state = 'hidden_unknown_or_error'::profile_visibility_state
        THEN 'hidden_unknown_or_error'::public.expert_visibility_state
      WHEN ep.expert_status = 'active' AND ep.profile_visibility_state = 'visible'::profile_visibility_state
        THEN 'visible_active'::public.expert_visibility_state
      WHEN ep.expert_status = 'active' THEN 'visible_active'::public.expert_visibility_state
      WHEN ep.profile_visibility_state = 'visible'::profile_visibility_state
        THEN 'visible_active'::public.expert_visibility_state
      ELSE 'hidden_incomplete_fields'::public.expert_visibility_state
    END;

    ALTER TABLE public.expert_profiles
      ALTER COLUMN expert_visibility_state SET NOT NULL,
      ALTER COLUMN expert_visibility_state SET DEFAULT 'hidden_incomplete_fields'::public.expert_visibility_state;

    ALTER TABLE public.expert_profiles DROP COLUMN expert_status;
    ALTER TABLE public.expert_profiles DROP COLUMN profile_visibility_state;

    DROP TYPE public.expert_status;
    DROP TYPE public.profile_visibility_state;
  END IF;
END $$;

COMMENT ON COLUMN public.expert_profiles.expert_visibility_state IS
  'Unified expert lifecycle and visibility (listing, admin review, gating, user-hidden).';
