/**
 * Server-only notifications: SendGrid (email), Twilio REST (SMS, optional).
 * Copy is loaded from admin-editable message_templates when available.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchMessageTemplate,
  resolveEmailFromTemplate,
  resolveInAppFromTemplate,
  resolveSmsFromTemplate,
  TEMPLATE_FALLBACKS,
} from "@/lib/notifications/message-templates";
import { dispatchInAppTemplateMessage } from "@/lib/notifications/dispatch-in-app-template";
import { isE164Phone, sendResolvedTemplateEmail, sendSmsTwilio } from "@/lib/notifications/send-channels";

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
    ctaUrl: vars.inbox_url,
    ctaLabel: "Open inbox",
  });
  if (email.enabled) {
    const emailed = await sendResolvedTemplateEmail(input.recipientEmail, email);
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
  recipientUserId: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientName: string;
  otherPartyName: string;
  expertName: string;
  learnerName: string;
  sessionDate: string;
  sessionTime: string;
  sessionLink: string;
  sessionStartTime?: string;
  sessionEndTime?: string;
  sessionDuration?: string;
  totalPaid?: string;
  extraTemplateVars?: Record<string, string>;
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
    session_start_time: input.sessionStartTime ?? input.sessionTime,
    session_end_time: input.sessionEndTime ?? "",
    session_duration: input.sessionDuration ?? "",
    total_paid: input.totalPaid ?? "",
    session_link: input.sessionLink,
    ...input.extraTemplateVars,
  };

  const email = resolveEmailFromTemplate(template, vars, {
    subject: `Reminder: session on ${input.sessionDate}`,
    body: `Hi ${input.recipientName},\n\nYour Convene session is coming up.\n\n${input.expertName} · ${input.learnerName}\n${input.sessionDate} at ${input.sessionTime}\n\nJoin: ${input.sessionLink}\n`,
    ctaUrl: input.sessionLink,
    ctaLabel: "Join session",
  });
  if (email.enabled && input.recipientEmail) {
    const emailed = await sendResolvedTemplateEmail(input.recipientEmail, email);
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

  await dispatchInAppTemplateMessage(admin, "booking_reminder", input.recipientUserId, vars, {
    session_link: input.sessionLink,
  });
}

export type HelpTicketReplyDispatch = {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
  threadUrl: string;
  fromLabel?: string;
};

export type ExpertRegistrationWelcomeDispatch = {
  recipientUserId: string;
  recipientEmail: string;
  recipientName: string;
};

export async function dispatchExpertRegistrationWelcome(
  input: ExpertRegistrationWelcomeDispatch,
): Promise<void> {
  const admin = createAdminClient();
  const template = await fetchMessageTemplate(admin, "expert_registration_welcome");
  const fb = TEMPLATE_FALLBACKS.expert_registration_welcome;
  const profileUrl = `${appBaseUrl()}/experts/${input.recipientUserId}`;
  const vars = {
    recipient_name: input.recipientName || "there",
    profile_url: profileUrl,
  };

  const email = resolveEmailFromTemplate(template, vars, {
    subject: fb.email_subject,
    body: fb.email_body,
    ctaUrl: fb.email_cta_url,
    ctaLabel: fb.email_cta_label,
  });
  if (email.enabled && input.recipientEmail) {
    const emailed = await sendResolvedTemplateEmail(input.recipientEmail, email);
    if (!emailed && process.env.NODE_ENV === "development") {
      console.info(
        "[notifications] expert registration welcome (email not sent)",
        input.recipientEmail,
      );
    }
  }
}

export type HelpTicketInAppBodyInput = {
  recipientName: string;
  subject: string;
  replyBody: string;
  fromLabel?: string;
  threadUrl: string;
};

/** In-app help ticket reply text (admin template when enabled, else raw reply). */
export async function resolveHelpTicketInAppMessage(input: HelpTicketInAppBodyInput): Promise<string> {
  const admin = createAdminClient();
  const template = await fetchMessageTemplate(admin, "help_ticket_reply");
  const fb = TEMPLATE_FALLBACKS.help_ticket_reply;
  const fromLabel = input.fromLabel?.trim() || "Convene Support";
  const vars = {
    recipient_name: input.recipientName || "there",
    ticket_subject: input.subject,
    reply_body: input.replyBody.trim(),
    from_label: fromLabel,
    thread_url: input.threadUrl,
  };

  const inApp = resolveInAppFromTemplate(template, vars, {
    subject: fb.in_app_subject || `Re: ${input.subject}`,
    body: fb.in_app_body || input.replyBody.trim(),
  });
  if (inApp.enabled && inApp.body.trim()) {
    return inApp.body;
  }
  return input.replyBody.trim();
}

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
    ctaUrl: input.threadUrl,
    ctaLabel: "Reply in Convene",
  });
  if (!email.enabled) return false;
  return sendResolvedTemplateEmail(input.recipientEmail, email);
}
