import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateConversationForPair } from "@/lib/messages/service";
import { resolveConveneTeamUserId } from "@/lib/messages/welcome-inbox";

/** Send a one-off in-app DM from the Convene team account (best-effort). */
export async function sendTeamInAppMessage(args: {
  recipientUserId: string;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const body = args.body.trim();
  if (!body) return false;

  const admin = createAdminClient();
  const teamId = await resolveConveneTeamUserId(admin);
  if (!teamId || teamId === args.recipientUserId) return false;

  const { data: teamRow } = await admin.from("users").select("user_id").eq("user_id", teamId).maybeSingle();
  if (!teamRow) return false;

  const convo = await findOrCreateConversationForPair(teamId, args.recipientUserId);
  const nowIso = new Date().toISOString();
  const { data: inserted, error: insErr } = await admin
    .from("messages")
    .insert({
      conversation_id: convo.conversation_id,
      sender_id: teamId,
      message: body,
      is_read: false,
      metadata: args.metadata ?? {},
    })
    .select("message_id, created_at")
    .single();

  if (insErr || !inserted) return false;

  await admin
    .from("conversations")
    .update({ updated_at: nowIso, last_message_at: inserted.created_at })
    .eq("conversation_id", convo.conversation_id);

  return true;
}
