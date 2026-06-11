-- Expert no-show refund queue + Stripe refund tracking; helpers for cron finalization.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS refund_review_status text NOT NULL DEFAULT 'none'
    CHECK (refund_review_status IN ('none', 'pending', 'resolved')),
  ADD COLUMN IF NOT EXISTS refunded_amount_cents bigint NOT NULL DEFAULT 0
    CHECK (refunded_amount_cents >= 0);

COMMENT ON COLUMN public.bookings.refund_review_status IS
  'Admin queue for learner refunds when expert no-shows; set pending when status becomes no_show_expert.';
COMMENT ON COLUMN public.bookings.refunded_amount_cents IS
  'Sum of Stripe refund amounts in cents issued for this booking (admin-initiated).';

CREATE INDEX IF NOT EXISTS bookings_refund_review_pending_idx
  ON public.bookings (refund_review_status)
  WHERE refund_review_status = 'pending';

-- Wall-clock session end in the expert IANA time zone (same convention as booking UI).
CREATE OR REPLACE FUNCTION public.booking_session_end_timestamptz(
  p_session_date date,
  p_end_time time,
  p_iana_tz text
) RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ((p_session_date::timestamp + p_end_time) AT TIME ZONE COALESCE(NULLIF(trim(p_iana_tz), ''), 'UTC'));
$$;

-- After scheduled end: derive status from learner_joined / expert_joined (source of truth).
CREATE OR REPLACE FUNCTION public.finalize_past_session_bookings()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r RECORD;
  ns booking_session_status;
  rs text;
  n int := 0;
  ids uuid[] := '{}';
BEGIN
  FOR r IN
    SELECT
      b.booking_id,
      b.learner_joined,
      b.expert_joined,
      b.refund_review_status AS prev_refund
    FROM public.bookings b
    JOIN public.users u ON u.user_id = b.expert_user_id
    WHERE b.status IN ('upcoming', 'live')
      AND public.booking_session_end_timestamptz(b.session_date, b.end_time, u.time_zone) < now()
  LOOP
    IF r.learner_joined IS NOT NULL AND r.expert_joined IS NOT NULL THEN
      ns := 'complete';
      rs := 'none';
    ELSIF r.learner_joined IS NULL AND r.expert_joined IS NULL THEN
      ns := 'no_show';
      rs := 'none';
    ELSIF r.learner_joined IS NULL THEN
      ns := 'no_show_learner';
      rs := 'none';
    ELSE
      ns := 'no_show_expert';
      IF r.prev_refund IS DISTINCT FROM 'resolved' THEN
        rs := 'pending';
      ELSE
        rs := 'resolved';
      END IF;
    END IF;

    UPDATE public.bookings
    SET
      status = ns,
      refund_review_status = rs,
      updated_at = now()
    WHERE booking_id = r.booking_id;

    n := n + 1;
    ids := array_append(ids, r.booking_id);
  END LOOP;

  RETURN jsonb_build_object('updatedCount', n, 'bookingIds', to_jsonb(ids));
END;
$$;

COMMENT ON FUNCTION public.finalize_past_session_bookings() IS
  'Cron: set status from join timestamps after session end; flag expert no-shows for refund review.';

GRANT EXECUTE ON FUNCTION public.finalize_past_session_bookings() TO service_role;
