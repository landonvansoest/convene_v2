-- Learner Stripe Customer id for PaymentIntent reuse (session checkout + extensions).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE INDEX IF NOT EXISTS users_stripe_customer_id_idx
  ON public.users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
