-- Re-introduce package deal fields on expert_availability (removed in 016) with stable names.

ALTER TABLE public.expert_availability
  ADD COLUMN IF NOT EXISTS package_deal_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS package_session_count integer,
  ADD COLUMN IF NOT EXISTS package_session_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS package_discount_type public.first_session_discount_type,
  ADD COLUMN IF NOT EXISTS package_discount_value numeric(12, 4),
  ADD COLUMN IF NOT EXISTS package_require_purchase boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.expert_availability.package_deal_enabled IS 'Expert registration / dashboard: multi-session package offer.';
COMMENT ON COLUMN public.expert_availability.package_require_purchase IS 'When true, learners must purchase the package to book.';

-- After this migration is applied on an environment, re-wire persistence: add package_* back to
-- `expertRegistrationPatchSchema`, GET profile, PATCH `availabilityUpdate`, and `saveDraft` payload
-- in `ExpertRegistrationForm.tsx` (they are omitted when these columns are absent).
