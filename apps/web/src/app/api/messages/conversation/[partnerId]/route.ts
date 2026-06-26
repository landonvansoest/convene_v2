import { createAdminClient } from "@/lib/supabase/admin";
import { displayName, getAuthedUserId, getUsersByIds } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { isUserOnlineFresh } from "@/lib/presence/online";

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

  const offerIds = [
    ...new Set(
      (rows ?? [])
        .map((m) => {
          const meta = m.metadata as Record<string, unknown> | null | undefined;
          return typeof meta?.offer_id === "string" ? meta.offer_id : null;
        })
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  let offerById = new Map<
    string,
    { status: string; offer_type: string; payload: Record<string, unknown> }
  >();
  if (offerIds.length > 0) {
    const { data: osRows, error: osErr } = await admin
      .from("offers")
      .select("offer_id, status, offer_type, payload")
      .in("offer_id", offerIds);
    if (osErr) {
      return Response.json({ error: publicApiError(osErr) }, { status: 500 });
    }
    offerById = new Map(
      (osRows ?? []).map((r) => [
        String(r.offer_id),
        {
          status: String(r.status),
          offer_type: String(r.offer_type),
          payload: (r.payload ?? {}) as Record<string, unknown>,
        },
      ]),
    );
  }

  const users = await getUsersByIds([userId, partnerId]);
  const byId = new Map(users.map((u) => [u.user_id, u]));

  const mapped = (rows ?? []).map((m) => {
    const sender = byId.get(m.sender_id);
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const oid = typeof meta.offer_id === "string" ? meta.offer_id : null;
    const otype = typeof meta.offer_type === "string" ? meta.offer_type : null;
    const offerRow = oid ? offerById.get(oid) : undefined;
    const companionMessage =
      typeof meta.companion_message === "string" ? meta.companion_message : null;
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
      metadata: meta,
      offer_id: oid,
      offer_type: offerRow?.offer_type ?? otype,
      offer_status: offerRow?.status ?? null,
      offer_payload: offerRow?.payload ?? null,
      companion_message: companionMessage,
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

  const partner = byId.get(partnerId);

  return Response.json({
    messages: mapped,
    partner: partner
      ? {
          user_id: partner.user_id,
          name: displayName(partner),
          profile_photo: partner.profile_photo,
          online: isUserOnlineFresh(partner.online, partner.last_seen_at),
        }
      : null,
  });
}
