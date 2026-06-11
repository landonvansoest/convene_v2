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

export async function sendEmailSendGrid(to: string, subject: string, text: string): Promise<boolean> {
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
