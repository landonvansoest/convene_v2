-- Idempotent package purchases from Stripe Checkout (webhook dedupe)

ALTER TABLE public.learner_package_credits
  ADD COLUMN IF NOT EXISTS source_checkout_session_id text;

CREATE UNIQUE INDEX IF NOT EXISTS learner_package_credits_source_checkout_idx
  ON public.learner_package_credits (source_checkout_session_id)
  WHERE source_checkout_session_id IS NOT NULL;

COMMENT ON COLUMN public.learner_package_credits.source_checkout_session_id IS 'Stripe Checkout Session id when credits were purchased; unique for idempotent webhook.';
