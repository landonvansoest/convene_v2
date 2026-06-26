-- 071_package_require_after_first_session.sql
-- After first paid session, learners must purchase a package to book again.

ALTER TABLE public.expert_availability
  ADD COLUMN IF NOT EXISTS package_require_purchase_after_first_session boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.expert_availability.package_require_purchase_after_first_session IS
  'When true with package_deal_enabled, learners may book one paid session first; subsequent bookings require package credits. Mutually exclusive with package_require_purchase.';
