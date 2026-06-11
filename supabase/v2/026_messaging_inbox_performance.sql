-- Fast inbox list: one row per conversation (latest message) instead of scanning all messages.

CREATE OR REPLACE FUNCTION public.latest_message_per_conversation(p_conversation_ids uuid[])
RETURNS TABLE (
  conversation_id uuid,
  message_id uuid,
  sender_id uuid,
  message text,
  created_at timestamptz,
  is_read boolean
)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    m.message_id,
    m.sender_id,
    m.message,
    m.created_at,
    m.is_read
  FROM public.messages m
  WHERE m.conversation_id = ANY(p_conversation_ids)
  ORDER BY m.conversation_id, m.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.unread_message_counts_by_conversation(
  p_viewer_user_id uuid,
  p_conversation_ids uuid[]
)
RETURNS TABLE (
  conversation_id uuid,
  unread_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT m.conversation_id, COUNT(*)::bigint
  FROM public.messages m
  WHERE m.conversation_id = ANY(p_conversation_ids)
    AND m.is_read = false
    AND m.sender_id <> p_viewer_user_id
  GROUP BY m.conversation_id;
$$;

COMMENT ON FUNCTION public.latest_message_per_conversation(uuid[]) IS
  'Dashboard inbox: latest message per conversation without loading full history.';
COMMENT ON FUNCTION public.unread_message_counts_by_conversation(uuid, uuid[]) IS
  'Unread inbound message counts per conversation for the viewer.';

GRANT EXECUTE ON FUNCTION public.latest_message_per_conversation(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.unread_message_counts_by_conversation(uuid, uuid[]) TO service_role;
