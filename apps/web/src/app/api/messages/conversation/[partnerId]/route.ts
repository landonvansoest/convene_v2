import { createAdminClient } from "@/lib/supabase/admin";
import { displayName, getAuthedUserId, getUsersByIds } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ partnerId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { partnerId } = await params;
  const admin = createAdminClient();

  const { data: conversation, error: convoErr } = await admin
    .from("conversations")
    .select("conversation_id")
    .or(
      `and(expert_user_id.eq.${userId},learner_user_id.eq.${partnerId}),and(expert_user_id.eq.${partnerId},learner_user_id.eq.${userId})`
    )
    .maybeSingle();

  if (convoErr) {
    return Response.json({ error: publicApiError(convoErr) }, { status: 500 });
  }
  if (!conversation) {
    return Response.json({ messages: [] });
  }

  const { data: rows, error: msgErr } = await admin
    .from("messages")
    .select("message_id, sender_id, message, is_read, created_at, metadata, conversation_id")
    .eq("conversation_id", conversation.conversation_id)
    .order("created_at", { ascending: true });

  if (msgErr) {
    return Response.json({ error: publicApiError(msgErr) }, { status: 500 });
  }

  const users = await getUsersByIds([userId, partnerId]);
  const byId = new Map(users.map((u) => [u.user_id, u]));

  const mapped = (rows ?? []).map((m) => {
    const sender = byId.get(m.sender_id);
    return {
      id: m.message_id,
      conversation_id: m.conversation_id,
      sender_id: m.sender_id,
      recipient_id: m.sender_id === userId ? partnerId : userId,
      subject:
        typeof m.metadata?.subject === "string"
          ? m.metadata.subject
          : null,
      message_body: m.message,
      parent_message_id:
        typeof m.metadata?.parent_message_id === "string"
          ? m.metadata.parent_message_id
          : null,
      is_read: m.is_read,
      created_at: m.created_at,
      sender_name: sender ? displayName(sender) : null,
      sender_photo: sender?.profile_photo ?? null,
    };
  });

  await admin
    .from("messages")
    .update({ is_read: true })
    .eq("conversation_id", conversation.conversation_id)
    .eq("is_read", false)
    .neq("sender_id", userId);

  return Response.json({ messages: mapped });
}
