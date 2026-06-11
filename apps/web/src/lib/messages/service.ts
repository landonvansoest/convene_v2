import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { dispatchNewMessageNotification } from "@/lib/notifications/dispatch";

type PublicUser = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email_address: string | null;
  phone_number: string | null;
  profile_photo: string | null;
  has_expert_profile: boolean | null;
  profession: string | null;
  online: boolean | null;
  last_seen_at: string | null;
};

export async function getAuthedUserId(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export function displayName(user: Pick<PublicUser, "first_name" | "last_name" | "email_address">) {
  const n = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return n || user.email_address || "User";
}

export async function getUsersByIds(userIds: string[]) {
  if (userIds.length === 0) {
    return [] as PublicUser[];
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select(
      "user_id, first_name, last_name, email_address, phone_number, profile_photo, has_expert_profile, profession, online, last_seen_at"
    )
    .in("user_id", userIds);

  if (error) throw new Error(error.message);
  return (data ?? []) as PublicUser[];
}

export async function findOrCreateConversationForPair(senderId: string, recipientId: string) {
  const admin = createAdminClient();

  const { data: existing, error: existingErr } = await admin
    .from("conversations")
    .select("conversation_id, expert_user_id, learner_user_id")
    .or(
      `and(expert_user_id.eq.${senderId},learner_user_id.eq.${recipientId}),and(expert_user_id.eq.${recipientId},learner_user_id.eq.${senderId})`
    )
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);
  if (existing) return existing;

  const users = await getUsersByIds([senderId, recipientId]);
  const sender = users.find((u) => u.user_id === senderId);
  const recipient = users.find((u) => u.user_id === recipientId);
  if (!sender || !recipient) throw new Error("Sender or recipient not found");

  let expertUserId: string;
  let learnerUserId: string;

  if (sender.has_expert_profile && !recipient.has_expert_profile) {
    expertUserId = senderId;
    learnerUserId = recipientId;
  } else if (!sender.has_expert_profile && recipient.has_expert_profile) {
    expertUserId = recipientId;
    learnerUserId = senderId;
  } else {
    // Fallback for expert-expert or learner-learner messages.
    expertUserId = recipientId;
    learnerUserId = senderId;
  }

  const { data: created, error: createErr } = await admin
    .from("conversations")
    .insert({
      expert_user_id: expertUserId,
      learner_user_id: learnerUserId,
      last_message_at: new Date().toISOString(),
    })
    .select("conversation_id, expert_user_id, learner_user_id")
    .single();

  if (createErr) throw new Error(createErr.message);
  return created;
}

export async function maybeDispatchMessageNotification(args: {
  senderId: string;
  recipientId: string;
  messageBody: string;
}) {
  const users = await getUsersByIds([args.senderId, args.recipientId]);
  const sender = users.find((u) => u.user_id === args.senderId);
  const recipient = users.find((u) => u.user_id === args.recipientId);
  if (!sender || !recipient || !recipient.email_address) return;

  await dispatchNewMessageNotification({
    recipientEmail: recipient.email_address,
    recipientPhone: recipient.phone_number,
    recipientName: displayName(recipient),
    senderName: displayName(sender),
    messagePreview:
      args.messageBody.length > 100
        ? `${args.messageBody.slice(0, 100)}...`
        : args.messageBody,
  });
}
