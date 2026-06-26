import { buildTransactionalEmailPayload } from "@/lib/notifications/email-layout";

export type SendEmailLayoutOptions = {
  /** Optional CTA button rendered below the body (use after resolving {{cta_url}} / {{cta_label}} vars). */
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  preheader?: string | null;
  /** Skip the branded shell (rare — defaults to false). */
  plain?: boolean;
  /**
   * Optional calendar invite (.ics). Sent as a separate follow-up email so clients
   * that render calendar attachments as the whole message do not hide the main copy.
   */
  calendarIcs?: string | null;
  /** Subject for the calendar follow-up email (defaults to "Add to calendar — Convene session"). */
  calendarFollowUpSubject?: string | null;
  /** Plain-text body for the calendar follow-up (optional). */
  calendarFollowUpBody?: string | null;
};

export type ResolvedTransactionalEmail = {
  subject: string;
  body: string;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  calendarIcs?: string | null;
  calendarFollowUpSubject?: string | null;
  calendarFollowUpBody?: string | null;
};

/** Send a resolved template email through the branded layout + optional CTA button. */
export async function sendResolvedTemplateEmail(
  to: string,
  email: ResolvedTransactionalEmail,
): Promise<boolean> {
  return sendEmailSendGrid(to, email.subject, email.body, {
    ctaUrl: email.ctaUrl,
    ctaLabel: email.ctaLabel,
    preheader: email.subject,
    calendarIcs: email.calendarIcs,
    calendarFollowUpSubject: email.calendarFollowUpSubject,
    calendarFollowUpBody: email.calendarFollowUpBody,
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isE164Phone(phone: string | null | undefined): phone is string {
  return !!phone && phone.startsWith("+") && /^\+[1-9]\d{6,14}$/.test(phone);
}

export function isSendGridConfigured(): boolean {
  return Boolean(
    process.env.SENDGRID_API_KEY?.trim() && process.env.SENDGRID_FROM_EMAIL?.trim(),
  );
}

function logSendGridError(e: unknown): void {
  if (e && typeof e === "object" && "response" in e) {
    const body = (e as { response?: { body?: unknown } }).response?.body;
    console.error("[notifications] SendGrid error", JSON.stringify(body ?? e));
    return;
  }
  console.error("[notifications] SendGrid error", e);
}

function calendarAttachment(calendarIcs: string) {
  return {
    content: Buffer.from(calendarIcs, "utf8").toString("base64"),
    filename: "convene-session.ics",
    // SendGrid rejects parameterized MIME types (e.g. `; method=PUBLISH`).
    type: "text/calendar",
    disposition: "attachment" as const,
  };
}

async function sendViaSendGrid(
  sg: import("@sendgrid/mail").MailService,
  message: {
    to: string;
    from: { email: string; name: string };
    replyTo?: { email: string };
    subject: string;
    text: string;
    html: string;
    attachments?: Array<{
      content: string;
      filename: string;
      type: string;
      disposition: "attachment";
    }>;
  },
): Promise<void> {
  await sg.send(message);
}

export async function sendEmailSendGrid(
  to: string,
  subject: string,
  text: string,
  layout?: SendEmailLayoutOptions,
): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim();
  const fromName = process.env.SENDGRID_FROM_NAME?.trim() || "Convene";
  const replyTo = process.env.SENDGRID_REPLY_TO?.trim() || undefined;
  if (!apiKey || !fromEmail) {
    console.warn(
      "[notifications] SendGrid not configured (set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL)",
    );
    return false;
  }

  const payload = layout?.plain
    ? {
        text: text.trim(),
        html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;">${escapeHtml(text).replace(/\n/g, "<br/>")}</div>`,
      }
    : buildTransactionalEmailPayload(text, layout);

  const calendarIcs = layout?.calendarIcs?.trim() || null;

  try {
    const mod = await import("@sendgrid/mail");
    const sg = mod.default;
    sg.setApiKey(apiKey);
    const from = { email: fromEmail, name: fromName };
    const baseMessage = {
      to,
      from,
      replyTo: replyTo ? { email: replyTo } : undefined,
      subject,
      text: payload.text,
      html: payload.html,
    };

    await sendViaSendGrid(sg, baseMessage);

    if (calendarIcs) {
      const followUpSubject =
        layout?.calendarFollowUpSubject?.trim() || "Add to calendar — Convene session";
      const followUpBody =
        layout?.calendarFollowUpBody?.trim() ||
        "Your Convene session is attached. Open the calendar file to add it to your calendar app.";
      const followUpHtml = `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;">${escapeHtml(followUpBody).replace(/\n/g, "<br/>")}</div>`;
      try {
        await sendViaSendGrid(sg, {
          to,
          from,
          replyTo: replyTo ? { email: replyTo } : undefined,
          subject: followUpSubject,
          text: followUpBody,
          html: followUpHtml,
          attachments: [calendarAttachment(calendarIcs)],
        });
      } catch (e) {
        logSendGridError(e);
        console.warn(
          "[notifications] calendar follow-up email failed (main notification was sent)",
          to,
        );
      }
    }

    return true;
  } catch (e) {
    logSendGridError(e);
    return false;
  }
}

export async function sendSmsTwilio(to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) return false;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) {
    console.error("[notifications] Twilio error", await res.text());
    return false;
  }
  return true;
}
