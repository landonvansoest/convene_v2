-- 068_booking_request_response_templates.sql
-- Templates when an expert approves or declines a learner booking request (auto-book off).
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
    'booking_request_approved',
    'Booking request approved',
    'Automatically when an expert approves a learner''s booking request (auto-book off) — sent to the learner with a link to complete payment.',
    true,
    '{{expert_name}} approved your booking request',
    '{{expert_name}} approved your session on {{session_date}} at {{session_time}}.

{{expert_message}}

Complete payment to confirm: {{bookings_url}}',
    true,
    'Booking approved — complete payment for {{session_date}}',
    'Hi {{recipient_name}},

Good news — [{{expert_name}}]({{expert_profile_url}}) approved your Convene session request for {{session_date}} at {{session_time}}.

Message from {{expert_name}}:
{{expert_message}}

Complete payment to confirm your booking: {{bookings_url}}',
    '{{bookings_url}}',
    'Complete payment',
    false,
    '',
    35
  ),
  (
    'booking_request_declined',
    'Booking request declined',
    'Automatically when an expert declines a learner''s booking request — sent to the learner (includes similar expert suggestions).',
    true,
    '{{expert_name}} declined your booking request',
    '{{expert_name}} declined your session request for {{session_date}} at {{session_time}}.

{{expert_message}}

{{refund_status}}',
    true,
    'Booking request declined: {{session_date}}',
    'Hi {{recipient_name}},

[{{expert_name}}]({{expert_profile_url}}) declined your Convene session request for {{session_date}} at {{session_time}}.

Message from {{expert_name}}:
{{expert_message}}

{{refund_status}}

{{similar_experts_section}}',
    '{{browse_url}}',
    'Browse experts',
    false,
    '',
    36
  )
ON CONFLICT (automation_key) DO NOTHING;
