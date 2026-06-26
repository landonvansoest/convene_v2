-- Track expert compensation when a learner no-show is reported from the waiting room.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS learner_no_show_payout_status text NOT NULL DEFAULT 'none'
    CHECK (learner_no_show_payout_status IN ('none', 'pending', 'paid', 'failed')),
  ADD COLUMN IF NOT EXISTS learner_no_show_expert_payout_cents bigint
    CHECK (learner_no_show_expert_payout_cents IS NULL OR learner_no_show_expert_payout_cents >= 0);

COMMENT ON COLUMN public.bookings.learner_no_show_payout_status IS
  'Stripe settlement for expert-reported learner no-show (50% booking_amount).';
COMMENT ON COLUMN public.bookings.learner_no_show_expert_payout_cents IS
  'Expert payout amount in cents retained after learner no-show settlement.';
