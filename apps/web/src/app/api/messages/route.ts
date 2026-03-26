import { z } from "zod";
import { publicApiError } from "@/lib/api/public-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  findOrCreateConversationForPair,
  getAuthedUserId,
  getUsersByIds,
  maybeDispatchMessageNotification,
  displayName,
} from "@/lib/messages/service";

export const dynamic = "force-dynamic";

const sendMessageSchema = z.object({
  recipientId: z.string().uuid(),
  subject: z.string().optional(),
  messageBody: z.string().trim().min(1),
  parentMessageId: z.string().uuid().optional().nullable(),
});

export async function POST(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = sendMessageSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const { recipientId, subject, messageBody, parentMessageId } = parsed.data;

  try {
    const conversation = await findOrCreateConversationForPair(userId, recipientId);
    const admin = createAdminClient();

    const metadata: Record<string, unknown> = {};
    if (subject) metadata.subject = subject;
    if (parentMessageId) metadata.parent_message_id = parentMessageId;

    const { data: inserted, error: insertErr } = await admin
      .from("messages")
      .insert({
        conversation_id: conversation.conversation_id,
        sender_id: userId,
        message: messageBody,
        is_read: false,
        metadata,
      })
      .select("*")
      .single();

    if (insertErr) {
      return Response.json({ error: publicApiError(insertErr) }, { status: 500 });
    }

    await admin
      .from("conversations")
      .update({ updated_at: new Date().toISOString(), last_message_at: inserted.created_at })
      .eq("conversation_id", conversation.conversation_id);

    await maybeDispatchMessageNotification({
      senderId: userId,
      recipientId,
      messageBody,
    });

    return Response.json({ message: inserted }, { status: 201 });
  } catch (e) {
    return Response.json({ error: publicApiError(e, "Failed to send message") }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  let conversationsQuery = admin
    .from("conversations")
    .select("conversation_id, expert_user_id, learner_user_id")
    .or(`expert_user_id.eq.${userId},learner_user_id.eq.${userId}`);

  if (type === "inbox") {
    conversationsQuery = admin
      .from("conversations")
      .select("conversation_id, expert_user_id, learner_user_id")
      .eq("expert_user_id", userId);
  } else if (type === "sent") {
    conversationsQuery = admin
      .from("conversations")
      .select("conversation_id, expert_user_id, learner_user_id")
      .eq("learner_user_id", userId);
  }

  const { data: conversations, error: convoErr } = await conversationsQuery;
  if (convoErr) {
    return Response.json({ error: publicApiError(convoErr) }, { status: 500 });
  }
  if (!conversations?.length) {
    return Response.json({ messages: [] });
  }

  const conversationIds = conversations.map((c) => c.conversation_id);
  const { data: rows, error: msgErr } = await admin
    .from("messages")
    .select("message_id, conversation_id, sender_id, message, is_read, created_at, metadata")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  if (msgErr) {
    return Response.json({ error: publicApiError(msgErr) }, { status: 500 });
  }

  const userIdSet = new Set<string>();
  for (const c of conversations) {
    userIdSet.add(c.expert_user_id);
    userIdSet.add(c.learner_user_id);
  }
  const users = await getUsersByIds(Array.from(userIdSet));
  const byId = new Map(users.map((u) => [u.user_id, u]));
  const convoById = new Map(conversations.map((c) => [c.conversation_id, c]));

  const mapped = (rows ?? []).map((m) => {
    const convo = convoById.get(m.conversation_id);
    const sender = byId.get(m.sender_id);
    const partnerId = convo
      ? convo.expert_user_id === m.sender_id
        ? convo.learner_user_id
        : convo.expert_user_id
      : null;
    const recipient = partnerId ? byId.get(partnerId) : null;
    return {
      id: m.message_id,
      conversation_id: m.conversation_id,
      sender_id: m.sender_id,
      recipient_id: partnerId,
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
      recipient_name: recipient ? displayName(recipient) : null,
      recipient_photo: recipient?.profile_photo ?? null,
    };
  });

  return Response.json({ messages: mapped });
}
