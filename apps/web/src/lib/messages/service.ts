import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchNewMessageNotification } from "@/lib/notifications/dispatch";
import { messagePreviewForEmail } from "@/lib/notifications/message-preview";
import {
  displayName,
  findOrCreateConversationForPair,
  getUsersByIds,
  type PublicUser,
} from "@/lib/messages/conversation-pair";

export { displayName, findOrCreateConversationForPair, getUsersByIds, type PublicUser };
export { getAuthedUserId } from "@/lib/auth/get-authed-user-id";

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
    messagePreview: messagePreviewForEmail(args.messageBody),
  });
}
