-- Idempotent server-side welcome message to inbox (see apps/web `ensureWelcomeInboxForUser`).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS welcome_inbox_sent_at timestamptz;
