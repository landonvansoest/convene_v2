-- Multi-channel message templates driving Convene's transactional notifications.
--
-- Each row is one "automation" — a specific business event (new DM, upcoming
-- session, refund issued, etc.). Each automation carries three templates:
--   * in-app inbox message (subject + body)
--   * email         (subject + body)
--   * sms           (body only)
--
-- The per-channel `*_enabled` flags let an admin silence a specific channel
-- for a given automation without losing the drafted copy. `{{…}}` placeholders
-- in the bodies are filled in by the dispatcher at send time.

CREATE TABLE IF NOT EXISTS public.message_templates (
  template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_key text NOT NULL UNIQUE,
  automation_label text NOT NULL,
  automation_description text NOT NULL DEFAULT '',
  in_app_enabled boolean NOT NULL DEFAULT true,
  in_app_subject text NOT NULL DEFAULT '',
  in_app_body text NOT NULL DEFAULT '',
  email_enabled boolean NOT NULL DEFAULT true,
  email_subject text NOT NULL DEFAULT '',
  email_body text NOT NULL DEFAULT '',
  sms_enabled boolean NOT NULL DEFAULT false,
  sms_body text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_templates_order_idx
  ON public.message_templates (display_order, automation_label);

COMMENT ON TABLE public.message_templates IS
  'Admin-editable multi-channel message templates (in-app / email / SMS) keyed by automation_key.';
COMMENT ON COLUMN public.message_templates.automation_key IS
  'Stable machine key used by server code to look up this template (e.g. new_message, booking_confirmed).';

-- Seed common automations so the grid has real rows to edit on first load.
-- The `ON CONFLICT (automation_key) DO NOTHING` clause makes the migration
-- idempotent and preserves admin edits on re-run.
INSERT INTO public.message_templates (
  automation_key, automation_label, automation_description,
  in_app_enabled, in_app_subject, in_app_body,
  email_enabled, email_subject, email_body,
  sms_enabled, sms_body,
  display_order
) VALUES
  (
    'new_message',
    'New direct message',
    'Sends when a user receives a new DM in their Convene inbox.',
    true,
    'New message from {{sender_name}}',
    '{{sender_name}} sent you a message on Convene:\n\n{{message_preview}}',
    true,
    'New message from {{sender_name}}',
    'Hi {{recipient_name}},\n\n{{sender_name}} sent you a message on Convene:\n\n{{message_preview}}\n\nOpen inbox: {{inbox_url}}',
    false,
    '{{sender_name}}: {{message_preview}}',
    10
  ),
  (
    'booking_confirmed',
    'Booking confirmed',
    'Sends to learner and expert when a new session booking is paid & confirmed.',
    true,
    'Session confirmed with {{other_party_name}}',
    'Your session with {{other_party_name}} is confirmed for {{session_date}} at {{session_time}}.',
    true,
    'Session confirmed: {{session_date}} at {{session_time}}',
    'Hi {{recipient_name}},\n\nYour Convene session is confirmed.\n\nWith: {{other_party_name}}\nWhen: {{session_date}} at {{session_time}} ({{time_zone}})\nJoin link: {{session_link}}\n\nSee you then!',
    false,
    'Convene: session with {{other_party_name}} confirmed for {{session_date}} {{session_time}}.',
    20
  ),
  (
    'booking_reminder',
    'Upcoming session reminder',
    'Sends ~1 hour before a scheduled session starts.',
    true,
    'Reminder: session on {{session_date}}',
    'Your Convene session with {{other_party_name}} starts at {{session_time}}. Join: {{session_link}}',
    true,
    'Reminder: session on {{session_date}}',
    'Hi {{recipient_name}},\n\nYour Convene session is coming up.\n\nWith: {{other_party_name}}\nWhen: {{session_date}} at {{session_time}}\nJoin: {{session_link}}',
    true,
    'Convene: session {{session_date}} {{session_time}}. {{session_link}}',
    30
  ),
  (
    'booking_canceled',
    'Booking canceled',
    'Sends when either side cancels a confirmed booking (includes refund status).',
    true,
    'Session canceled',
    'Your session with {{other_party_name}} on {{session_date}} has been canceled. {{refund_status}}',
    true,
    'Session canceled: {{session_date}}',
    'Hi {{recipient_name}},\n\nYour Convene session with {{other_party_name}} on {{session_date}} has been canceled.\n\n{{refund_status}}\n\nIf this was a mistake, you can rebook from their profile.',
    false,
    'Convene: session {{session_date}} canceled. {{refund_status}}',
    40
  ),
  (
    'refund_issued',
    'Refund issued',
    'Sends when an admin issues a refund from the Booking Problems queue.',
    true,
    'Refund issued',
    'We issued a {{refund_amount}} refund for your session on {{session_date}}. It should post to your card within 5–10 business days.',
    true,
    'Refund issued for {{session_date}}',
    'Hi {{recipient_name}},\n\nWe issued a {{refund_amount}} refund for your Convene session on {{session_date}}.\n\nIt should post to your original payment method within 5–10 business days.\n\nIf you have questions, reply to this email.',
    false,
    'Convene: {{refund_amount}} refund issued for {{session_date}}.',
    50
  ),
  (
    'expert_approved',
    'Expert registration approved',
    'Sends after an admin approves a pending expert registration.',
    true,
    'You''re approved on Convene',
    'Welcome to Convene! Your expert profile is live. Visit your dashboard to publish availability and start receiving bookings.',
    true,
    'You''re approved on Convene',
    'Hi {{recipient_name}},\n\nGreat news — your Convene expert profile has been approved and is now live on the platform.\n\nNext steps:\n• Publish your weekly availability.\n• Set your session pricing.\n• Share your profile link: {{profile_url}}\n\nWelcome aboard!',
    false,
    '',
    60
  ),
  (
    'welcome_learner',
    'Welcome (new learner)',
    'Sends on signup to users who aren''t registering as experts.',
    true,
    'Welcome to Convene',
    'Thanks for joining Convene. Browse experts or post a request to get started.',
    true,
    'Welcome to Convene',
    'Hi {{recipient_name}},\n\nWelcome to Convene — glad to have you.\n\nHere are three ways to get rolling:\n• Browse experts: {{browse_url}}\n• Post a request: {{post_request_url}}\n• Complete your profile: {{profile_url}}\n\nReply to this email anytime if you need a hand.',
    false,
    '',
    70
  )
ON CONFLICT (automation_key) DO NOTHING;
