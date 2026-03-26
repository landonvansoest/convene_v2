import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
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
    .select("conversation_id")
    .or(`expert_user_id.eq.${userId},learner_user_id.eq.${userId}`);

  if (convoErr) {
    return Response.json({ error: publicApiError(convoErr) }, { status: 500 });
  }

  const conversationIds = (conversations ?? []).map((c) => c.conversation_id);
  if (!conversationIds.length) {
    return Response.json({ count: 0 });
  }

  const { data: unreadRows, error: unreadErr } = await admin
    .from("messages")
    .select("message_id, sender_id", { count: "exact" })
    .in("conversation_id", conversationIds)
    .eq("is_read", false)
    .neq("sender_id", userId);

  if (unreadErr) {
    return Response.json({ error: publicApiError(unreadErr) }, { status: 500 });
  }

  return Response.json({ count: unreadRows?.length ?? 0 });
}
