-- Featured grid rule: hide experts who don't have a profile picture.
-- Defaults to TRUE so fresh installs start with the stricter visibility.

ALTER TABLE public.featured_experts_settings
  ADD COLUMN IF NOT EXISTS require_profile_picture boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.featured_experts_settings.require_profile_picture IS
  'When true, experts whose users.profile_photo is NULL are excluded from featured grid / GET /api/experts.';
