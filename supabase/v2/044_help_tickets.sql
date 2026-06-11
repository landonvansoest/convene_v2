-- 044_help_tickets.sql
-- Admin-facing help-desk inbox per Bible §"Admin tools".
--
-- A help ticket is a thread between a user (authed or guest by email) and
-- the support admins. Reply transport is one-way email for now:
--   • Admin replies in the dashboard → SendGrid emails the user
--     (lib/notifications/dispatch.ts → dispatchHelpTicketReply).
--   • User reply via email is NOT supported in v2 — the notification email
--     directs them back to /help/[ticketId] to reply in-app.
--
-- Tables:
--   help_tickets             — one row per ticket (status, channel, refs)
--   help_ticket_messages     — append-only thread (user + admin authors)
--
-- Status lifecycle:
--   open                — waiting on Convene
--   awaiting_user       — admin replied, waiting for user
--   resolved            — admin marked resolved
--   closed              — auto/admin closed; no further replies

DO $$ BEGIN
  CREATE TYPE help_ticket_status AS ENUM (
    'open',
    'awaiting_user',
    'resolved',
    'closed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE help_ticket_author AS ENUM ('user', 'admin', 'system');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.help_tickets (
  ticket_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Submitter identity. user_id is null for guest submissions; submitter_email
  -- is always required so we have a reply address.
  user_id uuid REFERENCES public.users (user_id) ON DELETE SET NULL,
  submitter_email text NOT NULL,
  submitter_name text,
  subject text NOT NULL,
  status help_ticket_status NOT NULL DEFAULT 'open',
  -- Free-form metadata: { source: "footer_contact_us", booking_id, url, ... }
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Snapshot of the most recent message for inbox list rendering.
  last_message_preview text,
  last_message_at timestamptz,
  last_author help_ticket_author,
  -- Admin assignment (free-form admin email for v2 — single-admin install).
  assigned_admin text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT help_tickets_email_chk CHECK (char_length(submitter_email) BETWEEN 3 AND 254),
  CONSTRAINT help_tickets_subject_chk CHECK (char_length(subject) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS help_tickets_status_idx
  ON public.help_tickets (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS help_tickets_user_idx
  ON public.help_tickets (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS help_tickets_email_idx
  ON public.help_tickets (lower(submitter_email), updated_at DESC);

COMMENT ON TABLE public.help_tickets IS
  'Inbound support tickets shown in the admin Help Tickets inbox. user_id may be null for guest submissions; submitter_email is the canonical reply address.';

CREATE TABLE IF NOT EXISTS public.help_ticket_messages (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.help_tickets (ticket_id) ON DELETE CASCADE,
  author help_ticket_author NOT NULL,
  -- For user-authored messages: user_id when authed, null when guest.
  user_id uuid REFERENCES public.users (user_id) ON DELETE SET NULL,
  -- For admin/system messages: free-form admin label (email or name).
  admin_label text,
  body text NOT NULL,
  -- True for the initial submission body (which is duplicated from the ticket
  -- subject/body to keep the thread self-contained).
  is_initial boolean NOT NULL DEFAULT false,
  -- Set when the email notification for this admin message has been
  -- dispatched (best-effort; null if SendGrid is unconfigured or failed).
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT help_ticket_messages_body_chk CHECK (char_length(body) BETWEEN 1 AND 8000)
);

CREATE INDEX IF NOT EXISTS help_ticket_messages_ticket_idx
  ON public.help_ticket_messages (ticket_id, created_at);

COMMENT ON TABLE public.help_ticket_messages IS
  'Append-only thread for a help_tickets row. One row per inbound or outbound message.';

-- Trigger: keep help_tickets.last_message_* + status fresh as the thread grows.
CREATE OR REPLACE FUNCTION public.tg_help_ticket_messages_refresh_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_preview text;
  v_status  help_ticket_status;
BEGIN
  v_preview := left(NEW.body, 200);

  -- User-authored message → ticket needs Convene's attention.
  -- Admin-authored message → waiting on the user.
  -- System messages don't change the status.
  IF NEW.author = 'user' THEN
    v_status := 'open';
  ELSIF NEW.author = 'admin' THEN
    v_status := 'awaiting_user';
  ELSE
    SELECT status INTO v_status FROM public.help_tickets WHERE ticket_id = NEW.ticket_id;
  END IF;

  UPDATE public.help_tickets
     SET last_message_preview = v_preview,
         last_message_at = NEW.created_at,
         last_author = NEW.author,
         status = CASE
                    -- Don't reopen resolved/closed when a system note is added.
                    WHEN status IN ('resolved', 'closed') AND NEW.author = 'system' THEN status
                    ELSE v_status
                  END,
         updated_at = now()
   WHERE ticket_id = NEW.ticket_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS help_ticket_messages_refresh_parent ON public.help_ticket_messages;
CREATE TRIGGER help_ticket_messages_refresh_parent
AFTER INSERT ON public.help_ticket_messages
FOR EACH ROW
EXECUTE FUNCTION public.tg_help_ticket_messages_refresh_parent();
