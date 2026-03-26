import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const uuidParam = z.string().uuid();

export async function PUT(_request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const parsed = uuidParam.safeParse(rawId);
  if (!parsed.success) {
    return Response.json(
      {
        error:
          "Invalid message id. Use only the UUID in the URL path (e.g. /api/messages/48243454-da32-407d-8c72-18a3b8ca6da2/read), not the full logged object.",
      },
      { status: 400 }
    );
  }
  const id = parsed.data;
  const admin = createAdminClient();

  const { data: target, error: fetchErr } = await admin
    .from("messages")
    .select("message_id, sender_id, conversation_id, is_read")
    .eq("message_id", id)
    .maybeSingle();

  if (fetchErr) {
    return Response.json({ error: publicApiError(fetchErr) }, { status: 500 });
  }
  if (!target) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  const { data: convo, error: convoErr } = await admin
    .from("conversations")
    .select("expert_user_id, learner_user_id")
    .eq("conversation_id", target.conversation_id)
    .maybeSingle();

  if (convoErr) {
    return Response.json({ error: publicApiError(convoErr) }, { status: 500 });
  }
  if (!convo) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const recipientId =
    target.sender_id === convo.expert_user_id ? convo.learner_user_id : convo.expert_user_id;
  if (recipientId !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: updateErr } = await admin
    .from("messages")
    .update({ is_read: true })
    .eq("message_id", id);

  if (updateErr) {
    return Response.json({ error: publicApiError(updateErr) }, { status: 500 });
  }

  return Response.json({ message: "Message marked as read" });
}
