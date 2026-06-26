-- 069_booking_request_stripe_payment_method.sql
-- Save learner card at booking request time; charge off-session when expert approves.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS stripe_setup_intent_id text;

COMMENT ON COLUMN public.bookings.stripe_payment_method_id IS
  'Learner PM saved via SetupIntent when requesting a session (auto-book off). Charged on expert approval.';

COMMENT ON COLUMN public.bookings.stripe_setup_intent_id IS
  'Most recent SetupIntent used to collect stripe_payment_method_id for a booking request.';
