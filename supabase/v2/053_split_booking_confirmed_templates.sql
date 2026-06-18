-- Split booking confirmation into learner vs expert message templates.
-- Requires 034_message_templates.sql. Idempotent.

INSERT INTO public.message_templates (
  automation_key, automation_label, automation_description,
  in_app_enabled, in_app_subject, in_app_body,
  email_enabled, email_subject, email_body,
  sms_enabled, sms_body,
  display_order
) VALUES
  (
    'new_booking',
    'New booking',
    'Automatically when session payment succeeds — sent to the expert who was booked (Stripe webhook / payment finalize).',
    true,
    'New booking from {{learner_name}}',
    '{{learner_name}} booked a session with you for {{session_date}} at {{session_time}}.',
    true,
    'New booking: {{session_date}} at {{session_time}}',
    'Hi {{recipient_name}},

{{learner_name}} booked a session with you.

When: {{session_date}} at {{session_time}} ({{time_zone}})
Join link: {{session_link}}

See you then!',
    false,
    'Convene: new booking from {{learner_name}} on {{session_date}} {{session_time}}.',
    21
  )
ON CONFLICT (automation_key) DO NOTHING;

UPDATE public.message_templates
SET
  automation_description = 'Automatically when session payment succeeds — sent to the learner who made the booking (Stripe webhook / payment finalize).',
  in_app_subject = 'Session confirmed with {{expert_name}}',
  in_app_body = 'Your session with {{expert_name}} is confirmed for {{session_date}} at {{session_time}}.',
  email_subject = 'Session confirmed: {{session_date}} at {{session_time}}',
  email_body = 'Hi {{recipient_name}},

Your Convene session is confirmed.

Expert: {{expert_name}}
When: {{session_date}} at {{session_time}} ({{time_zone}})
Join link: {{session_link}}

See you then!',
  sms_body = 'Convene: session with {{expert_name}} confirmed for {{session_date}} {{session_time}}.'
WHERE automation_key = 'booking_confirmed';
