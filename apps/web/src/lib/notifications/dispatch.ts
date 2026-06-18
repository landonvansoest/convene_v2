/**
 * Server-only notifications: SendGrid (email), Twilio REST (SMS, optional).
 * Copy is loaded from admin-editable message_templates when available.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchMessageTemplate,
  resolveEmailFromTemplate,
  resolveSmsFromTemplate,
} from "@/lib/notifications/message-templates";
import { isE164Phone, sendEmailSendGrid, sendSmsTwilio } from "@/lib/notifications/send-channels";

function appBaseUrl(): string {
  return (
    (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")) ||
    "http://localhost:3000"
  );
}

export type NewMessageDispatch = {
  recipientEmail: string;
  recipientPhone: string | null;
  recipientName: string;
  senderName: string;
  messagePreview: string;
  inboxUrl?: string;
};

export async function dispatchNewMessageNotification(input: NewMessageDispatch) {
  const admin = createAdminClient();
  const template = await fetchMessageTemplate(admin, "new_message");
  const vars = {
    recipient_name: input.recipientName,
    sender_name: input.senderName,
    message_preview: input.messagePreview,
    inbox_url: input.inboxUrl ?? `${appBaseUrl()}/messages`,
  };

  const email = resolveEmailFromTemplate(template, vars, {
    subject: `New message from ${input.senderName}`,
    body: `Hi ${input.recipientName},\n\n${input.senderName} sent you a message on Convene:\n\n${input.messagePreview}\n`,
  });
  if (email.enabled) {
    const emailed = await sendEmailSendGrid(input.recipientEmail, email.subject, email.body);
    if (!emailed && process.env.NODE_ENV === "development") {
      console.info("[notifications] new message (email not sent)", input.recipientEmail);
    }
  }

  const sms = resolveSmsFromTemplate(
    template,
    vars,
    `${input.senderName}: ${input.messagePreview.slice(0, 140)}`,
  );
  if (sms.enabled && isE164Phone(input.recipientPhone)) {
    await sendSmsTwilio(input.recipientPhone, sms.body);
  }
}

export type BookingReminderDispatch = {
  recipientEmail: string;
  recipientPhone: string | null;
  recipientName: string;
  otherPartyName: string;
  expertName: string;
  learnerName: string;
  sessionDate: string;
  sessionTime: string;
  sessionLink: string;
};

export async function dispatchBookingReminder(input: BookingReminderDispatch) {
  const admin = createAdminClient();
  const template = await fetchMessageTemplate(admin, "booking_reminder");

  const vars = {
    recipient_name: input.recipientName,
    other_party_name: input.otherPartyName,
    expert_name: input.expertName,
    learner_name: input.learnerName,
    session_date: input.sessionDate,
    session_time: input.sessionTime,
    session_link: input.sessionLink,
  };

  const email = resolveEmailFromTemplate(template, vars, {
    subject: `Reminder: session on ${input.sessionDate}`,
    body: `Hi ${input.recipientName},\n\nYour Convene session is coming up.\n\n${input.expertName} · ${input.learnerName}\n${input.sessionDate} at ${input.sessionTime}\n\nJoin: ${input.sessionLink}\n`,
  });
  if (email.enabled) {
    const emailed = await sendEmailSendGrid(input.recipientEmail, email.subject, email.body);
    if (!emailed && process.env.NODE_ENV === "development") {
      console.info("[notifications] booking reminder (email not sent)", input.recipientEmail);
    }
  }

  const sms = resolveSmsFromTemplate(
    template,
    vars,
    `Convene: session ${input.sessionDate} ${input.sessionTime}. ${input.sessionLink}`,
  );
  if (sms.enabled && isE164Phone(input.recipientPhone)) {
    await sendSmsTwilio(input.recipientPhone, sms.body);
  }
}

export type HelpTicketReplyDispatch = {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
  threadUrl: string;
  fromLabel?: string;
};

export async function dispatchHelpTicketReply(input: HelpTicketReplyDispatch): Promise<boolean> {
  const admin = createAdminClient();
  const template = await fetchMessageTemplate(admin, "help_ticket_reply");
  const fromLabel = input.fromLabel?.trim() || "Convene Support";
  const vars = {
    recipient_name: input.recipientName || "there",
    ticket_subject: input.subject,
    reply_body: input.body.trim(),
    from_label: fromLabel,
    thread_url: input.threadUrl,
  };

  const fallbackSubject = input.subject.startsWith("Re:") ? input.subject : `Re: ${input.subject}`;
  const fallbackBody = [
    `Hi ${input.recipientName || "there"},`,
    "",
    input.body.trim(),
    "",
    "—",
    fromLabel,
    "",
    "Reply in Convene to keep this conversation in one place:",
    input.threadUrl,
    "",
    "(Replies to this email are not monitored — please use the link above.)",
  ].join("\n");

  const email = resolveEmailFromTemplate(template, vars, {
    subject: fallbackSubject,
    body: fallbackBody,
  });
  if (!email.enabled) return false;
  return sendEmailSendGrid(input.recipientEmail, email.subject, email.body);
}
