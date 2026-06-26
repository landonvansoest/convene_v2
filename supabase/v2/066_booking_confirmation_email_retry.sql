-- Ensure booking confirmation emails stay enabled in admin templates.
UPDATE public.message_templates
SET email_enabled = true
WHERE automation_key IN ('booking_confirmed', 'new_booking')
  AND email_enabled = false;

-- To manually retry a booking whose emails failed before send-success was enforced:
--   UPDATE public.bookings SET confirmation_notified_at = NULL WHERE booking_id = '<uuid>';
-- Then call GET /api/notifications/check-booking-confirmations with CRON_SECRET,
-- or complete another payment finalize / package booking to trigger dispatch.
