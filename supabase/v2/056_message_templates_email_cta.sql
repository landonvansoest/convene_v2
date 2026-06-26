-- 056_message_templates_email_cta.sql
-- Optional per-template email CTA button (label + URL). Supports {{variables}}.
-- Re-run safe / idempotent.

ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS email_cta_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_cta_label text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.message_templates.email_cta_url IS
  'Optional email button link. Plain text with {{placeholders}}. Leave blank to hide the button.';
COMMENT ON COLUMN public.message_templates.email_cta_label IS
  'Optional email button label. Plain text with {{placeholders}}. Both label and URL required to show button.';

-- Sensible defaults for automations that benefit from a primary button.
UPDATE public.message_templates SET email_cta_label = 'Open inbox', email_cta_url = '{{inbox_url}}'
 WHERE automation_key = 'new_message' AND email_cta_url = '' AND email_cta_label = '';

UPDATE public.message_templates SET email_cta_label = 'Join session', email_cta_url = '{{session_link}}'
 WHERE automation_key IN ('booking_confirmed', 'booking_reminder') AND email_cta_url = '' AND email_cta_label = '';

UPDATE public.message_templates SET email_cta_label = 'Join session', email_cta_url = '{{session_link}}'
 WHERE automation_key = 'new_booking' AND email_cta_url = '' AND email_cta_label = '';

UPDATE public.message_templates SET email_cta_label = 'Reply in Convene', email_cta_url = '{{thread_url}}'
 WHERE automation_key = 'help_ticket_reply' AND email_cta_url = '' AND email_cta_label = '';
