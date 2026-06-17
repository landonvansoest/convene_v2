-- 050_help_tickets_conversation_link.sql
-- Unify help tickets with the messages/conversations inbox.
--
-- For authenticated submitters, every help ticket now also lives as a
-- conversation between the user and the "Convene Support" team account. The
-- conversation_id is stored on help_tickets so the admin Help Tickets inbox can
-- read the thread from public.messages (single source of truth) instead of the
-- legacy help_ticket_messages table. Guest tickets (no user_id) still rely on
-- help_ticket_messages — they can't be in a conversation.
--
-- The trigger below keeps help_tickets.last_message_*, last_author, and status
-- in sync with the linked conversation so the admin list view shows the right
-- ordering / unread state when the user replies via their dashboard inbox.

ALTER TABLE public.help_tickets
  ADD COLUMN IF NOT EXISTS conversation_id uuid
  REFERENCES public.conversations (conversation_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS help_tickets_conversation_id_idx
  ON public.help_tickets (conversation_id);

CREATE OR REPLACE FUNCTION public.tg_messages_sync_help_ticket()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket  public.help_tickets%ROWTYPE;
  v_author  help_ticket_author;
BEGIN
  SELECT * INTO v_ticket
  FROM public.help_tickets
  WHERE conversation_id = NEW.conversation_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- The submitter is the 'user' side. Anyone else (the Convene Support team
  -- account, in practice) is treated as 'admin' for status bookkeeping.
  IF v_ticket.user_id IS NOT NULL AND NEW.sender_id = v_ticket.user_id THEN
    v_author := 'user';
  ELSE
    v_author := 'admin';
  END IF;

  UPDATE public.help_tickets
     SET last_message_preview = left(NEW.message, 200),
         last_message_at = NEW.created_at,
         last_author = v_author,
         status = CASE
                    -- Don't reopen resolved/closed tickets automatically.
                    WHEN status IN ('resolved', 'closed') THEN status
                    WHEN v_author = 'user' THEN 'open'::help_ticket_status
                    ELSE 'awaiting_user'::help_ticket_status
                  END,
         updated_at = now()
   WHERE ticket_id = v_ticket.ticket_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_sync_help_ticket ON public.messages;
CREATE TRIGGER messages_sync_help_ticket
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.tg_messages_sync_help_ticket();

COMMENT ON COLUMN public.help_tickets.conversation_id IS
  'Link to the conversation that mirrors this ticket''s thread. NULL for guest tickets (no user_id) and tickets opened before 050_help_tickets_conversation_link.sql.';
