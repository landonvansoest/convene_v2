-- 063_expert_registration_help_ticket_channels.sql
-- Enable email on expert registration welcome + in-app on help ticket admin reply.

UPDATE public.message_templates
SET
  email_enabled = true,
  email_subject = 'Thanks for registering as an expert on Convene',
  email_body = 'Hi {{recipient_name}},

Thank you for sharing your expertise! We''re excited for you to engage with our community of learners.

Here are some tips to get started:

• Browse our community message boards to interact with learners
• Send custom offers to book your first sessions
• Share your [Expert Profile]({{profile_url}}) on your personal and social networks
• Check out our Expert coaching resources for tips on maximizing your bookings

We''ll review your application and email you when you''re approved.

Happy coaching!',
  email_cta_url = '{{profile_url}}',
  email_cta_label = 'View your profile',
  automation_description = 'Automatically once after an expert completes registration submit.'
WHERE automation_key = 'expert_registration_welcome'
  AND email_enabled = false;

UPDATE public.message_templates
SET
  in_app_enabled = true,
  in_app_subject = 'Re: {{ticket_subject}}',
  in_app_body = '{{reply_body}}

—
{{from_label}}',
  automation_description = 'When an admin replies to a help ticket (Admin → Help Tickets). Email + dashboard inbox for signed-in users.'
WHERE automation_key = 'help_ticket_reply'
  AND in_app_enabled = false;
