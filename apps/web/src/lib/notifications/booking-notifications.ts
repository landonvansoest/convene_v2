import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchMessageTemplate,
  resolveEmailFromTemplate,
  resolveSmsFromTemplate,
  TEMPLATE_FALLBACKS,
} from "@/lib/notifications/message-templates";
import { sendTeamInAppMessage } from "@/lib/notifications/in-app-team-message";
import {
  resolveInAppFromTemplate,
} from "@/lib/notifications/message-templates";
import { sendEmailSendGrid, sendSmsTwilio, isE164Phone } from "@/lib/notifications/send-channels";

function appBaseUrl(): string {
  return (
    (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")) ||
    "http://localhost:3000"
  );
}

function displayName(row: {
  first_name: string | null;
  last_name: string | null;
  email_address: string | null;
}) {
  const n = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return n || row.email_address || "User";
}

function formatSessionDate(sessionDate: string, startTime: string): string {
  const start = new Date(`${sessionDate}T${String(startTime).slice(0, 8)}`);
  return start.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatSessionTime(sessionDate: string, startTime: string): string {
  const start = new Date(`${sessionDate}T${String(startTime).slice(0, 8)}`);
  return start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

type PartyRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email_address: string | null;
  phone_number: string | null;
  time_zone?: string | null;
};

async function fetchBookingParties(booking: {
  expert_user_id: string;
  learner_user_id: string;
}) {
  const admin = createAdminClient();
  const { data: users } = await admin
    .from("users")
    .select("user_id, first_name, last_name, email_address, phone_number, time_zone")
    .in("user_id", [booking.expert_user_id, booking.learner_user_id]);

  const expert = users?.find((u) => u.user_id === booking.expert_user_id) as PartyRow | undefined;
  const learner = users?.find((u) => u.user_id === booking.learner_user_id) as PartyRow | undefined;
  return { admin, expert, learner };
}

async function notifyParty(
  admin: ReturnType<typeof createAdminClient>,
  automationKey: string,
  recipient: PartyRow,
  vars: Record<string, string>,
) {
  const template = await fetchMessageTemplate(admin, automationKey);
  const fb = TEMPLATE_FALLBACKS[automationKey];
  if (!fb) return;

  const email = resolveEmailFromTemplate(template, vars, {
    subject: fb.email_subject,
    body: fb.email_body,
  });
  if (email.enabled && recipient.email_address) {
    await sendEmailSendGrid(recipient.email_address, email.subject, email.body);
  }

  const sms = resolveSmsFromTemplate(template, vars, fb.sms_body);
  if (sms.enabled && isE164Phone(recipient.phone_number)) {
    await sendSmsTwilio(recipient.phone_number, sms.body);
  }
}

async function notifyBookingParties(
  automationKey: "booking_canceled",
  booking: {
    booking_id: string;
    session_date: string;
    start_time: string;
    expert_user_id: string;
    learner_user_id: string;
  },
  extraVars: Record<string, string> = {},
) {
  const { admin, expert, learner } = await fetchBookingParties(booking);
  if (!expert || !learner) return;

  const sessionDate = formatSessionDate(booking.session_date, booking.start_time);
  const sessionTime = formatSessionTime(booking.session_date, booking.start_time);
  const sessionLink = `${appBaseUrl()}/session/${booking.booking_id}`;
  const expertName = displayName(expert);
  const learnerName = displayName(learner);

  for (const recipient of [expert, learner]) {
    const other = recipient.user_id === expert.user_id ? learner : expert;
    const vars: Record<string, string> = {
      recipient_name: displayName(recipient),
      other_party_name: displayName(other),
      expert_name: expertName,
      learner_name: learnerName,
      session_date: sessionDate,
      session_time: sessionTime,
      session_link: sessionLink,
      time_zone: (recipient.time_zone ?? other.time_zone ?? "UTC").trim() || "UTC",
      refund_status: extraVars.refund_status ?? "",
      ...extraVars,
    };

    await notifyParty(admin, automationKey, recipient, vars);
  }
}

export async function dispatchBookingConfirmed(bookingId: string) {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("booking_id, session_date, start_time, expert_user_id, learner_user_id, payment_status")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!booking || booking.payment_status !== "paid") return;

  const { expert, learner } = await fetchBookingParties(booking);
  if (!expert || !learner) return;

  const sessionDate = formatSessionDate(booking.session_date, booking.start_time);
  const sessionTime = formatSessionTime(booking.session_date, booking.start_time);
  const sessionLink = `${appBaseUrl()}/session/${booking.booking_id}`;
  const expertName = displayName(expert);
  const learnerName = displayName(learner);

  await notifyParty(admin, "booking_confirmed", learner, {
    recipient_name: learnerName,
    expert_name: expertName,
    learner_name: learnerName,
    other_party_name: expertName,
    session_date: sessionDate,
    session_time: sessionTime,
    session_link: sessionLink,
    time_zone: (learner.time_zone ?? expert.time_zone ?? "UTC").trim() || "UTC",
  });

  await notifyParty(admin, "new_booking", expert, {
    recipient_name: expertName,
    expert_name: expertName,
    learner_name: learnerName,
    other_party_name: learnerName,
    session_date: sessionDate,
    session_time: sessionTime,
    session_link: sessionLink,
    time_zone: (expert.time_zone ?? learner.time_zone ?? "UTC").trim() || "UTC",
  });
}

export async function dispatchBookingCanceled(bookingId: string, refundStatus = "") {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("booking_id, session_date, start_time, expert_user_id, learner_user_id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!booking) return;
  await notifyBookingParties("booking_canceled", booking, {
    refund_status: refundStatus || "No refund was issued for this cancellation.",
  });
}

export async function dispatchRefundIssuedEmail(args: {
  recipientEmail: string;
  recipientName: string;
  sessionDate: string;
  refundAmount: string;
}) {
  const admin = createAdminClient();
  const template = await fetchMessageTemplate(admin, "refund_issued");
  const fb = TEMPLATE_FALLBACKS.refund_issued;
  const vars = {
    recipient_name: args.recipientName,
    session_date: args.sessionDate,
    refund_amount: args.refundAmount,
  };
  const email = resolveEmailFromTemplate(template, vars, {
    subject: fb.email_subject,
    body: fb.email_body,
  });
  if (email.enabled) {
    await sendEmailSendGrid(args.recipientEmail, email.subject, email.body);
  }
}

export async function dispatchExpertApproved(args: {
  recipientUserId: string;
  recipientEmail: string;
  recipientName: string;
}) {
  const admin = createAdminClient();
  const template = await fetchMessageTemplate(admin, "expert_approved");
  const fb = TEMPLATE_FALLBACKS.expert_approved;
  const profileUrl = `${appBaseUrl()}/experts/${args.recipientUserId}`;
  const vars = {
    recipient_name: args.recipientName,
    profile_url: profileUrl,
  };

  const email = resolveEmailFromTemplate(template, vars, {
    subject: fb.email_subject,
    body: fb.email_body,
  });
  if (email.enabled && args.recipientEmail) {
    await sendEmailSendGrid(args.recipientEmail, email.subject, email.body);
  }

  const inApp = resolveInAppFromTemplate(template, vars, {
    subject: fb.in_app_subject,
    body: fb.in_app_body,
  });
  if (inApp.enabled) {
    await sendTeamInAppMessage({
      recipientUserId: args.recipientUserId,
      body: inApp.body,
      metadata: { expert_approved: true },
    });
  }
}
