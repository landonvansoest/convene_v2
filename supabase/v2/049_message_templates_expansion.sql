-- Additional message templates + description fixes for admin Message Templates grid.
-- Requires 034_message_templates.sql. Idempotent.

INSERT INTO public.message_templates (
  automation_key, automation_label, automation_description,
  in_app_enabled, in_app_subject, in_app_body,
  email_enabled, email_subject, email_body,
  sms_enabled, sms_body,
  display_order
) VALUES
  (
    'help_ticket_reply',
    'Help ticket admin reply',
    'When an admin replies to a help ticket (Admin → Help Tickets). Email only — user continues in-app at /help/[id].',
    false,
    '',
    '',
    true,
    'Re: {{ticket_subject}}',
    'Hi {{recipient_name}},

{{reply_body}}

—
{{from_label}}

Reply in Convene to keep this conversation in one place:
{{thread_url}}

(Replies to this email are not monitored — please use the link above.)',
    false,
    '',
    80
  ),
  (
    'expert_registration_welcome',
    'Expert registration submitted',
    'Automatically once after an expert completes registration submit.',
    true,
    'Thanks for registering as an expert',
    'Thank you for sharing your expertise! We''re excited for you to engage with our community of learners.

Here are some tips to get started:

• Browse our community message boards to interact with learners
• Send custom offers to book your first sessions
• Share the url to your Expert Profile ({{profile_url}}) on your personal and social networks
• Check out our Expert coaching resources for tips on maximizing your bookings

Happy coaching!',
    false,
    '',
    '',
    false,
    '',
    75
  )
ON CONFLICT (automation_key) DO NOTHING;

UPDATE public.message_templates
SET automation_description = 'Automatically ~15 minutes before session start (cron: check-booking-reminders, every 2 min).'
WHERE automation_key = 'booking_reminder'
  AND automation_description LIKE '%~1 hour%';
