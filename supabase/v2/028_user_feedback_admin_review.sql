-- Admin review queue for user complaints submitted through the "Leave a review"
-- session-issue flow. Adds an admin_review_status column to user_feedback so
-- the Booking Problems / User Complaint view can show pending items and mark
-- them resolved after an admin takes action (refund, DM, or dismissal).

ALTER TABLE public.user_feedback
  ADD COLUMN IF NOT EXISTS admin_review_status text NOT NULL DEFAULT 'none'
    CHECK (admin_review_status IN ('none', 'pending', 'resolved')),
  ADD COLUMN IF NOT EXISTS admin_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_resolution_note text;

COMMENT ON COLUMN public.user_feedback.admin_review_status IS
  'Admin triage state for session-linked complaints: none (no admin action required), pending (awaiting admin review), resolved (admin took action).';

-- Backfill: every feedback row tied to a booking is treated as a pending
-- complaint that an admin should look at. Rows with no booking_id remain
-- `none` (general feedback, not a queued complaint).
UPDATE public.user_feedback
SET admin_review_status = 'pending'
WHERE admin_review_status = 'none'
  AND booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_feedback_admin_pending_idx
  ON public.user_feedback (admin_review_status, created_at DESC)
  WHERE admin_review_status = 'pending';
