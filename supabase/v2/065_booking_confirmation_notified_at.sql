-- Track when booking confirmation emails (learner + expert) were dispatched.
-- Allows idempotent retries after payment finalize without duplicate sends.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS confirmation_notified_at timestamptz;

COMMENT ON COLUMN public.bookings.confirmation_notified_at IS
  'Set after booking_confirmed + new_booking notifications are dispatched for a paid booking.';

-- Ensure new_booking template row exists (split from booking_confirmed in 053).
INSERT INTO public.message_templates (
  automation_key, automation_label, automation_description,
  in_app_enabled, in_app_subject, in_app_body,
  email_enabled, email_subject, email_body,
  email_cta_url, email_cta_label,
  sms_enabled, sms_body,
  display_order
) VALUES (
  'new_booking',
  'New booking',
  'Automatically when session payment succeeds — sent to the expert who was booked.',
  true,
  'New booking from {{learner_name}}',
  '{{learner_name}} booked a session with you for {{session_date}} at {{session_time}}.',
  true,
  'New booking: {{session_date}} at {{session_time}}',
  E'Hi {{recipient_name}},\n\n{{learner_name}} booked a session with you.\n\nWhen: {{session_date}} at {{session_time}} ({{time_zone}})\nJoin link: {{session_link}}\n\nAdd to calendar: {{calendar_link}}\n\nSee you then!',
  '{{bookings_url}}',
  'View booked sessions',
  false,
  'Convene: new booking from {{learner_name}} on {{session_date}} {{session_time}}.',
  21
)
ON CONFLICT (automation_key) DO NOTHING;
