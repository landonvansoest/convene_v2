-- Package credit expiration reminder tracking + message templates.
-- Requires 034_message_templates.sql. Idempotent.

ALTER TABLE public.learner_package_credits
  ADD COLUMN IF NOT EXISTS expiry_reminder_30d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_reminder_14d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_reminder_7d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_reminder_3d_sent_at timestamptz;

COMMENT ON COLUMN public.learner_package_credits.expiry_reminder_30d_sent_at IS
  'When the ~1 month before expiration reminder was dispatched; NULL = not yet sent.';
COMMENT ON COLUMN public.learner_package_credits.expiry_reminder_14d_sent_at IS
  'When the ~2 weeks before expiration reminder was dispatched; NULL = not yet sent.';
COMMENT ON COLUMN public.learner_package_credits.expiry_reminder_7d_sent_at IS
  'When the ~1 week before expiration reminder was dispatched; NULL = not yet sent.';
COMMENT ON COLUMN public.learner_package_credits.expiry_reminder_3d_sent_at IS
  'When the ~3 days before expiration reminder was dispatched; NULL = not yet sent.';

INSERT INTO public.message_templates (
  automation_key, automation_label, automation_description,
  in_app_enabled, in_app_subject, in_app_body,
  email_enabled, email_subject, email_body,
  sms_enabled, sms_body,
  display_order
) VALUES
  (
    'package_purchased',
    'Package purchased',
    'Automatically when a learner completes package checkout (Stripe webhook) — confirms credits granted and expiration.',
    true,
    'Package confirmed: {{package_title}}',
    'You purchased {{credit_count}} sessions with {{expert_name}} ({{package_title}}). Credits expire {{expiration_date}}. Book a session: {{book_url}}',
    true,
    'Package purchase confirmed: {{package_title}}',
    'Hi {{recipient_name}},

Your Convene package purchase is confirmed.

Expert: {{expert_name}}
Package: {{package_title}}
Sessions: {{credit_count}}
Expires: {{expiration_date}}

Book a session: {{book_url}}
View credits: {{account_url}}',
    false,
    'Convene: {{credit_count}} sessions with {{expert_name}} — expires {{expiration_date}}.',
    22
  ),
  (
    'package_credit_expiring',
    'Package credits expiring soon',
    'Automatically at ~1 month, ~2 weeks, ~1 week, and ~3 days before unused credits expire (cron: check-package-credit-expiration-reminders, daily).',
    true,
    'Credits expiring in {{days_until_expiry_label}}',
    'You have {{remaining_credits}} unused session(s) with {{expert_name}} ({{package_title}}) expiring on {{expiration_date}}. Book now: {{book_url}}',
    true,
    'Reminder: package credits expiring in {{days_until_expiry_label}}',
    'Hi {{recipient_name}},

You have {{remaining_credits}} unused session(s) with {{expert_name}} for {{package_title}}.

They expire on {{expiration_date}} ({{days_until_expiry_label}} from now).

Book a session: {{book_url}}
View credits: {{account_url}}',
    true,
    'Convene: {{remaining_credits}} session(s) with {{expert_name}} expire {{expiration_date}}. {{book_url}}',
    25
  )
ON CONFLICT (automation_key) DO NOTHING;
