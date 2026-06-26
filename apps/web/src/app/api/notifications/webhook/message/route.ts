import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  dispatchNewMessageNotification,
  type NewMessageDispatch,
} from "@/lib/notifications/dispatch";
import { messagePreviewForEmail } from "@/lib/notifications/message-preview";

export const dynamic = "force-dynamic";

function parseMessageWebhook(raw: Record<string, unknown>) {
  const message_id = String(raw.message_id ?? raw.messageId ?? "").trim();
  const conversation_id = String(
    raw.conversation_id ?? raw.conversationId ?? ""
  ).trim();
  const sender_id = String(raw.sender_id ?? raw.senderId ?? "").trim();
  if (!message_id || !conversation_id || !sender_id) {
    return { ok: false as const, error: "message_id, conversation_id, sender_id required" };
  }
  return { ok: true as const, message_id, conversation_id, sender_id };
}

function authOk(request: Request): boolean {
  const secret = process.env.NOTIFICATION_WEBHOOK_SECRET;
  if (!secret) return false;
  const header =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-webhook-secret");
  if (!header) return false;
  try {
    const a = Buffer.from(header);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function displayName(row: {
  first_name: string | null;
  last_name: string | null;
  email_address: string | null;
}) {
  const n = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return n || row.email_address || "User";
}

export async function POST(request: Request) {
  if (!authOk(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!json || typeof json !== "object") {
    return Response.json({ error: "Expected JSON object" }, { status: 400 });
  }

  const parsed = parseMessageWebhook(json as Record<string, unknown>);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { message_id, conversation_id, sender_id } = parsed;

  const admin = createAdminClient();

  const { data: message, error: msgErr } = await admin
    .from("messages")
    .select("message_id, message, sender_id, conversation_id")
    .eq("message_id", message_id)
    .maybeSingle();

  if (msgErr || !message) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  const { data: conversation, error: convErr } = await admin
    .from("conversations")
    .select("expert_user_id, learner_user_id")
    .eq("conversation_id", conversation_id)
    .maybeSingle();

  if (convErr || !conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const recipientId =
    conversation.learner_user_id === sender_id
      ? conversation.expert_user_id
      : conversation.learner_user_id;

  const { data: senderRow } = await admin
    .from("users")
    .select("first_name, last_name, email_address")
    .eq("user_id", sender_id)
    .maybeSingle();

  const { data: recipientRow } = await admin
    .from("users")
    .select("first_name, last_name, email_address, phone_number")
    .eq("user_id", recipientId)
    .maybeSingle();

  if (!senderRow || !recipientRow?.email_address) {
    return Response.json({ error: "User details not found" }, { status: 404 });
  }

  const payload: NewMessageDispatch = {
    recipientEmail: recipientRow.email_address,
    recipientPhone: recipientRow.phone_number,
    recipientName: displayName(recipientRow),
    senderName: displayName(senderRow),
    messagePreview: messagePreviewForEmail(message.message ?? ""),
  };

  await dispatchNewMessageNotification(payload);

  return Response.json({ success: true });
}
