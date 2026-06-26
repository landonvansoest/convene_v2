-- 057_expert_no_show_refund_template.sql
-- Template for learner notification when admin issues a refund for expert no-show.
-- Requires 034_message_templates.sql. Idempotent.

INSERT INTO public.message_templates (
  automation_key, automation_label, automation_description,
  in_app_enabled, in_app_subject, in_app_body,
  email_enabled, email_subject, email_body,
  email_cta_url, email_cta_label,
  sms_enabled, sms_body,
  display_order
) VALUES (
  'expert_no_show_refund',
  'Expert no-show refund',
  'When an admin issues a refund from Booking Problems → Expert No Show. Sends email + in-app DM (unless the admin overrides the message).',
  true,
  'Refund issued for your session',
  'We''re sorry {{expert_name}} wasn''t able to join your session on {{session_date}} at {{session_time}}.

We issued a {{refund_amount}} refund to your original payment method. It should post within 5–10 business days.

Thank you for your patience — we hope to see you back on Convene soon.',
  true,
  'Refund issued: expert no-show on {{session_date}}',
  'Hi {{recipient_name}},

We''re sorry {{expert_name}} wasn''t able to join your scheduled Convene session on {{session_date}} at {{session_time}}.

We issued a {{refund_amount}} refund to your original payment method. It should post within 5–10 business days.

If you have any questions, reply to this email or message us from your dashboard inbox.',
  '{{dashboard_url}}',
  'Open dashboard',
  false,
  '',
  45
)
ON CONFLICT (automation_key) DO NOTHING;
