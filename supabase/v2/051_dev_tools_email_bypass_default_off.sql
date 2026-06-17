-- Flip the runtime default for the signup email-verification bypass tool
-- from ON to OFF. Now that Supabase Auth has real email delivery (custom
-- SMTP via SendGrid) and "Confirm email" is enabled in the Auth project
-- settings, the DEV bypass button should stay hidden in local dev unless an
-- admin explicitly turns it back on from Website CMS → DEV Tools. Production
-- builds were never affected (the button is gated behind NODE_ENV === 'development').

UPDATE public.dev_tools
SET enabled = false,
    updated_at = now()
WHERE tool_key = 'email_verification_bypass';

-- Keep the row idempotent if the migration runs before 036_dev_tools.sql for
-- some reason (fresh DB created from a partial snapshot).
INSERT INTO public.dev_tools (tool_key, enabled)
VALUES ('email_verification_bypass', false)
ON CONFLICT (tool_key) DO NOTHING;
