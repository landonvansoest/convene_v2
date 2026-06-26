/**
 * Operator alerts for the Convene admin inbox.
 *
 * Fires a SendGrid email to `ADMIN_ALERT_EMAIL` (falling back to
 * `ADMIN_EMAIL`, then to the team.convene.io@gmail.com mailbox) whenever
 * something needs human attention — new expert registration submitted, new
 * help ticket opened, etc.
 *
 * Designed to be fire-and-forget: any failure is logged but never thrown,
 * so the user-facing request always succeeds even if SendGrid is down or
 * misconfigured.
 */

import { sendEmailSendGrid } from "@/lib/notifications/send-channels";

const DEFAULT_ADMIN_ALERT_EMAIL = "team.convene.io@gmail.com";

function adminAlertRecipient(): string {
  return (
    process.env.ADMIN_ALERT_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    DEFAULT_ADMIN_ALERT_EMAIL
  );
}

function appBaseUrl(): string {
  return (
    (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")) ||
    "http://localhost:3000"
  );
}

type AdminReviewPath =
  | "expert-registrations"
  | "refunds"
  | "freelance-review"
  | "help-tickets"
  | "user-feedback";

const REVIEW_PATH_LABEL: Record<AdminReviewPath, string> = {
  "expert-registrations": "Expert Registrations",
  refunds: "Booking Problems",
  "freelance-review": "Freelance Review",
  "help-tickets": "Help Tickets",
  "user-feedback": "User Feedback",
};

function adminReviewLink(path: AdminReviewPath): string {
  return `${appBaseUrl()}/admin  →  User Review → ${REVIEW_PATH_LABEL[path]}`;
}

async function sendAdminAlert(subject: string, body: string): Promise<void> {
  try {
    const ok = await sendEmailSendGrid(adminAlertRecipient(), subject, body);
    if (!ok) {
      console.warn("[admin-alerts] SendGrid disabled or failed; skipping", subject);
    }
  } catch (e) {
    console.error("[admin-alerts] unexpected error sending", subject, e);
  }
}

export type ExpertRegistrationAlertInput = {
  userId: string;
  name: string | null;
  email: string | null;
  profession: string | null;
};

export async function dispatchExpertRegistrationAlert(
  input: ExpertRegistrationAlertInput,
): Promise<void> {
  const displayName = input.name?.trim() || "(no name on file)";
  const displayProfession = input.profession?.trim() || "(profession not set)";
  const displayEmail = input.email?.trim() || "(no email on file)";

  const subject = `New expert registration pending review — ${displayName}`;
  const body = [
    "A new expert just submitted their registration and is awaiting admin review.",
    "",
    `Name:        ${displayName}`,
    `Email:       ${displayEmail}`,
    `Profession:  ${displayProfession}`,
    `User ID:     ${input.userId}`,
    "",
    "Review in the admin dashboard:",
    adminReviewLink("expert-registrations"),
  ].join("\n");

  await sendAdminAlert(subject, body);
}

export type HelpTicketAlertInput = {
  ticketId: string;
  subject: string;
  body: string;
  submitterEmail: string;
  submitterName: string | null;
  isAuthenticated: boolean;
};

export async function dispatchHelpTicketAlert(input: HelpTicketAlertInput): Promise<void> {
  const submitter = input.submitterName?.trim()
    ? `${input.submitterName.trim()} <${input.submitterEmail}>`
    : input.submitterEmail;
  const preview = input.body.length > 800 ? `${input.body.slice(0, 800)}…` : input.body;

  const subject = `New help ticket: ${input.subject}`;
  const body = [
    "A new help ticket was just opened on Convene.",
    "",
    `From:       ${submitter}`,
    `Auth state: ${input.isAuthenticated ? "signed-in user" : "guest"}`,
    `Ticket ID:  ${input.ticketId}`,
    `Subject:    ${input.subject}`,
    "",
    "Message:",
    preview,
    "",
    "Reply in the admin dashboard:",
    adminReviewLink("help-tickets"),
  ].join("\n");

  await sendAdminAlert(subject, body);
}

export type BookingNoShowAlertInput = {
  bookingId: string;
  sessionDate: string;
  startTime: string;
  learnerName: string | null;
  expertName: string | null;
};

export async function dispatchBookingNoShowAlert(input: BookingNoShowAlertInput): Promise<void> {
  const subject = `Booking problem: expert no-show — ${input.sessionDate}`;
  const body = [
    "A session was finalized as an expert no-show and needs refund review.",
    "",
    `Booking ID:  ${input.bookingId}`,
    `Session:     ${input.sessionDate} ${input.startTime}`,
    `Learner:     ${input.learnerName?.trim() || "—"}`,
    `Expert:      ${input.expertName?.trim() || "—"}`,
    "",
    "Review in the admin dashboard:",
    adminReviewLink("refunds"),
  ].join("\n");

  await sendAdminAlert(subject, body);
}

export type BookingComplaintAlertInput = {
  feedbackId: string;
  bookingId: string;
  feedbackType: string;
  feedbackText: string;
};

export async function dispatchBookingComplaintAlert(
  input: BookingComplaintAlertInput,
): Promise<void> {
  const preview =
    input.feedbackText.length > 800 ? `${input.feedbackText.slice(0, 800)}…` : input.feedbackText;

  const subject = `Booking problem: user complaint — ${input.feedbackType.replace(/_/g, " ")}`;
  const body = [
    "A learner or expert submitted a session issue that needs admin review.",
    "",
    `Feedback ID: ${input.feedbackId}`,
    `Booking ID:  ${input.bookingId}`,
    `Type:        ${input.feedbackType}`,
    "",
    "Details:",
    preview,
    "",
    "Review in the admin dashboard:",
    adminReviewLink("refunds"),
  ].join("\n");

  await sendAdminAlert(subject, body);
}

export type FreelanceReviewAlertInput = {
  freelanceId: string;
  reason: string | null;
  totalPrice: number | string | null;
};

export async function dispatchFreelanceReviewAlert(input: FreelanceReviewAlertInput): Promise<void> {
  const subject = "Freelance work needs admin review";
  const body = [
    "A freelance booking was escalated to the admin review queue.",
    "",
    `Freelance ID: ${input.freelanceId}`,
    `Total price:  ${input.totalPrice ?? "—"}`,
    `Reason:       ${input.reason?.trim() || "(not specified)"}`,
    "",
    "Review in the admin dashboard:",
    adminReviewLink("freelance-review"),
  ].join("\n");

  await sendAdminAlert(subject, body);
}

export type UserFeedbackAlertInput = {
  feedbackId?: string;
  feedbackType: string;
  feedbackText: string;
  userEmail?: string | null;
  userName?: string | null;
};

export async function dispatchUserFeedbackAlert(input: UserFeedbackAlertInput): Promise<void> {
  const label = input.feedbackType.replace(/_/g, " ");
  const preview =
    input.feedbackText.length > 800 ? `${input.feedbackText.slice(0, 800)}…` : input.feedbackText;
  const who =
    input.userName?.trim() && input.userEmail?.trim()
      ? `${input.userName.trim()} <${input.userEmail.trim()}>`
      : input.userEmail?.trim() || input.userName?.trim() || "—";

  const subject = `New user feedback: ${label}`;
  const body = [
    "New feedback was submitted on Convene and is awaiting review.",
    "",
    input.feedbackId ? `Feedback ID: ${input.feedbackId}` : null,
    `Type:        ${input.feedbackType}`,
    `From:        ${who}`,
    "",
    "Message:",
    preview,
    "",
    "Review in the admin dashboard:",
    adminReviewLink("user-feedback"),
  ]
    .filter(Boolean)
    .join("\n");

  await sendAdminAlert(subject, body);
}
