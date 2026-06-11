-- Membership tier overrides get an optional expiration timestamp so admins can
-- grant a verified/enterprise tier (or custom session rate) that automatically
-- lapses on a chosen date. NULL = override never expires.

ALTER TABLE public.expert_profiles
  ADD COLUMN IF NOT EXISTS membership_override_expires_at timestamptz;

COMMENT ON COLUMN public.expert_profiles.membership_override_expires_at IS
  'Optional expiration timestamp for admin-granted membership tier / price override. NULL = indefinite.';

CREATE INDEX IF NOT EXISTS expert_profiles_membership_override_expires_idx
  ON public.expert_profiles (membership_override_expires_at)
  WHERE membership_override_expires_at IS NOT NULL;
