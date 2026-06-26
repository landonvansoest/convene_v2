-- 061_booking_canceled_expert_name_hyperlink.sql
-- Use markdown-style [label](url) in email body so expert name renders as a hyperlink in HTML.
-- Re-run safe.

UPDATE public.message_templates
SET email_body = 'Hi {{recipient_name}},

We''re sorry — [{{expert_name}}]({{expert_profile_url}}) had to cancel your Convene session on {{session_date}} at {{session_time}}.

{{refund_status}}

{{similar_experts_section}}'
WHERE automation_key = 'booking_canceled_by_expert';
