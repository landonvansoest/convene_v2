-- Idempotent package_purchase ledger rows (tie to Stripe Checkout Session)

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_stripe_checkout_session_idx
  ON public.transactions (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

COMMENT ON COLUMN public.transactions.stripe_checkout_session_id IS 'Stripe Checkout Session id for package purchases; unique for idempotent ledger + webhook retries.';
