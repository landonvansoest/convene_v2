import { createAdminClient } from "@/lib/supabase/admin";
import { displayName, getAuthedUserId, getUsersByIds } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: conversations, error: convoErr } = await admin
    .from("conversations")
    .select("conversation_id, expert_user_id, learner_user_id, last_message_at, updated_at")
    .or(`expert_user_id.eq.${userId},learner_user_id.eq.${userId}`)
    .order("updated_at", { ascending: false });

  if (convoErr) {
    return Response.json({ error: publicApiError(convoErr) }, { status: 500 });
  }
  if (!conversations?.length) {
    return Response.json({ conversations: [] });
  }

  const partnerIds = conversations.map((c) =>
    c.expert_user_id === userId ? c.learner_user_id : c.expert_user_id
  );
  const users = await getUsersByIds(Array.from(new Set(partnerIds)));
  const byId = new Map(users.map((u) => [u.user_id, u]));

  const convoIds = conversations.map((c) => c.conversation_id);
  const { data: messages, error: msgErr } = await admin
    .from("messages")
    .select("conversation_id, sender_id, message, created_at, is_read")
    .in("conversation_id", convoIds)
    .order("created_at", { ascending: false });

  if (msgErr) {
    return Response.json({ error: publicApiError(msgErr) }, { status: 500 });
  }

  const latestByConversation = new Map<string, (typeof messages)[number]>();
  const unreadByConversation = new Map<string, number>();
  for (const m of messages ?? []) {
    if (!latestByConversation.has(m.conversation_id)) {
      latestByConversation.set(m.conversation_id, m);
    }
    if (!m.is_read && m.sender_id !== userId) {
      unreadByConversation.set(
        m.conversation_id,
        (unreadByConversation.get(m.conversation_id) ?? 0) + 1
      );
    }
  }

  const mapped = conversations.map((c) => {
    const partnerId = c.expert_user_id === userId ? c.learner_user_id : c.expert_user_id;
    const partner = byId.get(partnerId);
    const latest = latestByConversation.get(c.conversation_id);
    return {
      conversation_id: c.conversation_id,
      partner_id: partnerId,
      partner_name: partner ? displayName(partner) : null,
      partner_photo: partner?.profile_photo ?? null,
      partner_type: partner?.has_expert_profile ? "expert" : "learner",
      last_message: latest?.message ?? null,
      last_message_time: latest?.created_at ?? c.last_message_at ?? c.updated_at,
      unread_count: unreadByConversation.get(c.conversation_id) ?? 0,
    };
  });

  return Response.json({ conversations: mapped });
}
