-- 060_split_booking_canceled_templates.sql
-- Split booking_canceled into expert-initiated vs learner-initiated templates.
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
    'booking_canceled_by_expert',
    'Booking canceled by expert',
    'Automatically when an expert cancels a booking — sent to the learner (includes similar expert suggestions).',
    true,
    'Session canceled by {{expert_name}}',
    '{{expert_name}} canceled your session on {{session_date}} at {{session_time}}. {{refund_status}}',
    true,
    'Session canceled: {{session_date}}',
    'Hi {{recipient_name}},

We''re sorry — {{expert_name}} had to cancel your Convene session on {{session_date}} at {{session_time}}.

{{refund_status}}

View {{expert_name}}''s profile: {{expert_profile_url}}

{{similar_experts_section}}',
    '{{browse_url}}',
    'Browse experts',
    false,
    'Convene: {{expert_name}} canceled your session {{session_date}}. {{refund_status}}',
    40
  ),
  (
    'booking_canceled_by_learner',
    'Booking canceled by learner',
    'Automatically when a learner cancels a booking — sent to the expert who was booked.',
    true,
    'Session canceled by {{learner_name}}',
    '{{learner_name}} canceled your session on {{session_date}} at {{session_time}}. {{refund_status}}',
    true,
    'Session canceled: {{session_date}}',
    'Hi {{recipient_name}},

{{learner_name}} canceled your Convene session on {{session_date}} at {{session_time}}.

{{refund_status}}

View your booked sessions: {{bookings_url}}',
    '{{bookings_url}}',
    'View booked sessions',
    false,
    'Convene: {{learner_name}} canceled your session {{session_date}}. {{refund_status}}',
    41
  )
ON CONFLICT (automation_key) DO NOTHING;

-- Retire the combined template (kept for legacy fallback in code).
UPDATE public.message_templates
SET
  automation_label = 'Booking canceled (legacy)',
  automation_description = 'Fallback only when cancelled_by is missing on the booking. Prefer booking_canceled_by_expert / booking_canceled_by_learner.',
  email_enabled = false,
  sms_enabled = false,
  display_order = 42
WHERE automation_key = 'booking_canceled';
