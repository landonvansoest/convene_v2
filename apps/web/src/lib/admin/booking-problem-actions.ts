import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateConversationForPair } from "@/lib/messages/conversation-pair";
import { getAuthedUserId } from "@/lib/auth/get-authed-user-id";
import { resolveConveneTeamUserId } from "@/lib/messages/welcome-inbox";

type DmResult =
  | { sent: true; message_id: string; sender_id: string }
  | { sent: false; reason: string };

/**
 * Send a DM from the Convene team (or the signed-in admin, as a fallback) to a
 * learner, in the context of an admin booking-problem resolution.
 */
export async function sendAdminBookingDm(args: {
  recipientUserId: string;
  message: string;
  bookingId?: string;
  feedbackId?: string;
  kind: "refund" | "dismiss";
}): Promise<DmResult> {
  const body = args.message.trim();
  if (!body) return { sent: false, reason: "empty_message" };

  const admin = createAdminClient();

  let senderId = await resolveConveneTeamUserId(admin);
  if (!senderId) {
    // Fall back to the logged-in admin user so the message still goes out.
    senderId = (await getAuthedUserId()) ?? null;
  }
  if (!senderId) return { sent: false, reason: "no_sender_configured" };
  if (senderId === args.recipientUserId) {
    return { sent: false, reason: "sender_matches_recipient" };
  }

  // Make sure the sender exists in public.users so the message FK is valid.
  const { data: senderRow } = await admin
    .from("users")
    .select("user_id")
    .eq("user_id", senderId)
    .maybeSingle();
  if (!senderRow?.user_id) return { sent: false, reason: "sender_not_in_users" };

  const convo = await findOrCreateConversationForPair(senderId, args.recipientUserId);

  const metadata: Record<string, unknown> = {
    admin_booking_problem: true,
    kind: args.kind,
  };
  if (args.bookingId) metadata.booking_id = args.bookingId;
  if (args.feedbackId) metadata.feedback_id = args.feedbackId;

  const { data: inserted, error: insErr } = await admin
    .from("messages")
    .insert({
      conversation_id: convo.conversation_id,
      sender_id: senderId,
      message: body,
      is_read: false,
      metadata,
    })
    .select("message_id, created_at")
    .single();

  if (insErr) return { sent: false, reason: insErr.message };

  await admin
    .from("conversations")
    .update({
      updated_at: new Date().toISOString(),
      last_message_at: inserted.created_at,
    })
    .eq("conversation_id", convo.conversation_id);

  return { sent: true, message_id: inserted.message_id as string, sender_id: senderId };
}

/**
 * Mark a user_feedback row as resolved. Tolerates missing migration 028 so
 * admin actions still succeed on older schemas.
 */
export async function resolveUserFeedback(
  feedbackId: string,
  note?: string,
): Promise<{ resolved: boolean; error?: string }> {
  const admin = createAdminClient();
  const body: Record<string, unknown> = {
    admin_review_status: "resolved",
    admin_resolved_at: new Date().toISOString(),
  };
  if (note && note.trim()) body.admin_resolution_note = note.trim();

  const { error } = await admin.from("user_feedback").update(body).eq("feedback_id", feedbackId);
  if (!error) return { resolved: true };

  const msg = error.message?.toLowerCase() ?? "";
  if (msg.includes("admin_review_status") || msg.includes("admin_resolved_at") || msg.includes("schema cache")) {
    // Migration 028 not applied yet — nothing persistent to mark, but we don't
    // want to fail the whole admin action.
    return { resolved: false, error: "migration_028_not_applied" };
  }
  return { resolved: false, error: error.message };
}
