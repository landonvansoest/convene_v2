-- Add `waitlisted` to expert_visibility_state so admins can defer an expert
-- registration decision without rejecting or approving it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'expert_visibility_state'
      AND e.enumlabel = 'waitlisted'
  ) THEN
    ALTER TYPE public.expert_visibility_state ADD VALUE 'waitlisted';
  END IF;
END
$$;

COMMENT ON TYPE public.expert_visibility_state IS
  'Expert profile visibility: visible_active / visible_temp / pending_admin_review / waitlisted / hidden_* .';
