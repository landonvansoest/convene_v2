-- 070_booking_reschedule_accepted_templates.sql
-- Confirmation emails when a reschedule proposal is accepted (new session time).
-- Requires 034_message_templates.sql. Idempotent.

INSERT INTO public.message_templates (
  automation_key, automation_label, automation_description,
  in_app_enabled, in_app_subject, in_app_body,
  email_enabled, email_subject, email_body,
  email_cta_url, email_cta_label,
  sms_enabled, sms_body,
  display_order
) VALUES
  (
    'booking_reschedule_accepted_learner',
    'Reschedule accepted (learner)',
    'Automatically when a reschedule proposal is accepted — sent to the learner with the updated session time.',
    true,
    'Session rescheduled with {{expert_name}}',
    'Your session with {{expert_name}} has been rescheduled to {{session_date}} at {{session_time}}.',
    true,
    'Session rescheduled: {{session_date}} at {{session_time}}',
    'Hi {{recipient_name}},

Your Convene session has been rescheduled.

Expert: {{expert_name}}
New time: {{session_date}} at {{session_time}} ({{time_zone}})
Join link: {{session_link}}

Add to calendar: {{calendar_link}}

See you then!',
    '{{session_link}}',
    'Join session',
    false,
    'Convene: session with {{expert_name}} rescheduled to {{session_date}} {{session_time}}.',
    37
  ),
  (
    'booking_reschedule_accepted_expert',
    'Reschedule accepted (expert)',
    'Automatically when a reschedule proposal is accepted — sent to the expert with the updated session time.',
    true,
    'Session rescheduled with {{learner_name}}',
    '{{learner_name}} accepted your reschedule proposal. The session is now {{session_date}} at {{session_time}}.',
    true,
    'Session rescheduled: {{session_date}} at {{session_time}}',
    'Hi {{recipient_name}},

A reschedule proposal was accepted for your Convene session.

Learner: {{learner_name}}
New time: {{session_date}} at {{session_time}} ({{time_zone}})
Join link: {{session_link}}

Add to calendar: {{calendar_link}}

See you then!',
    '{{bookings_url}}',
    'View booked sessions',
    false,
    'Convene: session with {{learner_name}} rescheduled to {{session_date}} {{session_time}}.',
    38
  )
ON CONFLICT (automation_key) DO NOTHING;
