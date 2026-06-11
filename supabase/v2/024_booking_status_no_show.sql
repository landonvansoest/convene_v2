-- Additional booking_session_status values for no-show outcomes.
-- Business rules (application / ops):
--   no_show_expert: expert did not join before scheduled end; learner entitled to full refund (process separately).
--   no_show_learner: learner did not join before scheduled end; no refund to learner.
--   no_show: neither party joined before scheduled end.

ALTER TYPE public.booking_session_status ADD VALUE IF NOT EXISTS 'no_show_expert';
ALTER TYPE public.booking_session_status ADD VALUE IF NOT EXISTS 'no_show_learner';
ALTER TYPE public.booking_session_status ADD VALUE IF NOT EXISTS 'no_show';

-- Link session issue feedback to a booking when reporting problems after a session.
ALTER TABLE public.user_feedback
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings (booking_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS user_feedback_booking_idx
  ON public.user_feedback (booking_id)
  WHERE booking_id IS NOT NULL;
