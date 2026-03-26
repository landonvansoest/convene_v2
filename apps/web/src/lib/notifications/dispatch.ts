/**
 * Server-only notifications: SendGrid (email), Twilio REST (SMS, optional).
 * Falls back to console when providers are not configured.
 */

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isE164(phone: string | null): phone is string {
  return !!phone && phone.startsWith("+") && /^\+[1-9]\d{6,14}$/.test(phone);
}

async function sendEmailSendGrid(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  const from = process.env.SENDGRID_FROM_EMAIL?.trim();
  if (!apiKey || !from) return false;
  try {
    const mod = await import("@sendgrid/mail");
    const sg = mod.default;
    sg.setApiKey(apiKey);
    await sg.send({
      to,
      from,
      subject,
      text,
      html: `<p>${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`,
    });
    return true;
  } catch (e) {
    console.error("[notifications] SendGrid error", e);
    return false;
  }
}

async function sendSmsTwilio(to: string, body: string): Promise<boolean> {
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

export type NewMessageDispatch = {
  recipientEmail: string;
  recipientPhone: string | null;
  recipientName: string;
  senderName: string;
  messagePreview: string;
};

export async function dispatchNewMessageNotification(input: NewMessageDispatch) {
  const subject = `New message from ${input.senderName}`;
  const text = `Hi ${input.recipientName},\n\n${input.senderName} sent you a message on Convene:\n\n${input.messagePreview}\n`;

  const emailed = await sendEmailSendGrid(input.recipientEmail, subject, text);
  if (!emailed && process.env.NODE_ENV === "development") {
    console.info("[notifications] new message (email not sent)", input.recipientEmail);
  }

  if (isE164(input.recipientPhone)) {
    const smsBody = `${input.senderName}: ${input.messagePreview.slice(0, 140)}`;
    await sendSmsTwilio(input.recipientPhone, smsBody);
  }
}

export type BookingReminderDispatch = {
  recipientEmail: string;
  recipientPhone: string | null;
  recipientName: string;
  expertName: string;
  learnerName: string;
  sessionDate: string;
  sessionTime: string;
  sessionLink: string;
};

export async function dispatchBookingReminder(input: BookingReminderDispatch) {
  const subject = `Reminder: session on ${input.sessionDate}`;
  const text = `Hi ${input.recipientName},\n\nYour Convene session is coming up.\n\n${input.expertName} · ${input.learnerName}\n${input.sessionDate} at ${input.sessionTime}\n\nJoin: ${input.sessionLink}\n`;

  const emailed = await sendEmailSendGrid(input.recipientEmail, subject, text);
  if (!emailed && process.env.NODE_ENV === "development") {
    console.info("[notifications] booking reminder (email not sent)", input.recipientEmail);
  }

  if (isE164(input.recipientPhone)) {
    await sendSmsTwilio(
      input.recipientPhone,
      `Convene: session ${input.sessionDate} ${input.sessionTime}. ${input.sessionLink}`
    );
  }
}
