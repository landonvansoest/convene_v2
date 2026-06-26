-- 058_new_booking_cta_bookings_url.sql
-- Point new-booking expert email CTA at dashboard Booked Sessions (not session join link).

UPDATE public.message_templates
SET
  email_cta_label = 'View booked sessions',
  email_cta_url = '{{bookings_url}}'
WHERE automation_key = 'new_booking'
  AND (
    email_cta_url = '{{session_link}}'
    OR (email_cta_url = '' AND email_cta_label = '')
    OR (email_cta_label = 'Join session' AND email_cta_url LIKE '%session_link%')
  );
