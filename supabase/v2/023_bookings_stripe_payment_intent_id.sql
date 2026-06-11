-- Idempotent session checkout: booking row is created on payment_intent.succeeded with PI id.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_stripe_payment_intent_id_key
  ON public.bookings (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
