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
  const reviewUrl = `${appBaseUrl()}/admin`;
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
    `${reviewUrl}  →  User Review → Expert Registrations`,
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
  const reviewUrl = `${appBaseUrl()}/admin`;
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
    `${reviewUrl}  →  User Review → Help Tickets`,
  ].join("\n");

  await sendAdminAlert(subject, body);
}
