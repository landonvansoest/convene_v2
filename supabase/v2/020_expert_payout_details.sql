-- Optional JSON blob for in-app payout / bank collection during expert registration (no Stripe branding in UI).
ALTER TABLE public.expert_profiles
  ADD COLUMN IF NOT EXISTS payout_details jsonb;

COMMENT ON COLUMN public.expert_profiles.payout_details IS 'Structured payout/bank fields collected in expert registration; processed by ops/Stripe as needed.';
