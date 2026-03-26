-- Stripe Connect account id for marketplace payouts (ported from v1 expert_profiles usage)
ALTER TABLE public.expert_profiles
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;

COMMENT ON COLUMN public.expert_profiles.stripe_connect_account_id IS 'Stripe Connect Express/Standard account id for this expert; null until onboarding complete.';
