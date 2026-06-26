-- 059_booking_calendar_ics.sql
-- Add {{calendar_link}} to booking confirmation email bodies (ics is also attached at send time).

UPDATE public.message_templates
SET email_body = email_body || E'\n\nAdd to calendar: {{calendar_link}}'
WHERE automation_key IN ('booking_confirmed', 'new_booking')
  AND email_body NOT LIKE '%{{calendar_link}}%';
