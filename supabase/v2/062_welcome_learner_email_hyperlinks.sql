-- 062_welcome_learner_email_hyperlinks.sql
-- Use markdown [label](url) in welcome email so link text is clickable in HTML email.

UPDATE public.message_templates
SET email_body = 'Hi {{recipient_name}},

Welcome to Convene — glad to have you.

Here are three ways to get rolling:
• [Browse experts]({{browse_url}})
• [Post a request]({{post_request_url}})
• [Complete your profile]({{profile_url}})

Reply to this email anytime if you need a hand.'
WHERE automation_key = 'welcome_learner'
  AND email_body LIKE '%Browse experts: {{browse_url}}%';
