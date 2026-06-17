/**
 * Diagnose why an email Supabase Auth handed off to SendGrid SMTP didn't arrive.
 *
 * Usage (from apps/web):
 *   node scripts/diagnose-sendgrid-delivery.mjs you+test@gmail.com
 *
 * Queries SendGrid's free suppression APIs (bounces / blocks / spam reports /
 * invalid emails / global unsubscribes) for the given address and prints
 * any match. These suppression lists do NOT require the paid Email Activity
 * History add-on — they work on every SendGrid plan.
 *
 * If nothing matches and the user said `confirmation_sent_at` was stamped in
 * Supabase, then the most likely remaining causes are:
 *   • Wrong SMTP credentials in Supabase Auth → Emails → SMTP Settings (the
 *     SMTP handshake fails — check Supabase Dashboard → Logs → Auth Logs).
 *   • Sender Identity in Supabase SMTP Settings doesn't match a Verified
 *     Sender in SendGrid → silent drop on send.
 *   • Email Activity Feed in SendGrid → message shows as "Processed" but
 *     never "Delivered" — usually a deferred/temporary issue.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
} catch (e) {
  console.error("Could not read .env.local:", e.message);
  process.exit(1);
}

const apiKey = process.env.SENDGRID_API_KEY?.trim();
const target = (process.argv[2] || "").trim().toLowerCase();

if (!apiKey) {
  console.error("FAIL: SENDGRID_API_KEY missing in .env.local");
  process.exit(1);
}
if (!target) {
  console.error("FAIL: pass an email to look up (argv[2])");
  console.error("  node scripts/diagnose-sendgrid-delivery.mjs you+test@gmail.com");
  process.exit(1);
}

async function sgGet(path) {
  const res = await fetch(`https://api.sendgrid.com/v3${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

console.log("Looking up SendGrid suppression state for:", target);
console.log();

const lookups = [
  { name: "Bounces", path: `/suppression/bounces/${encodeURIComponent(target)}` },
  { name: "Blocks", path: `/suppression/blocks/${encodeURIComponent(target)}` },
  { name: "Spam reports", path: `/suppression/spam_reports/${encodeURIComponent(target)}` },
  { name: "Invalid emails", path: `/suppression/invalid_emails/${encodeURIComponent(target)}` },
  { name: "Global unsubscribes", path: `/asm/suppressions/global/${encodeURIComponent(target)}` },
];

let anyMatch = false;
for (const { name, path } of lookups) {
  const { status, body } = await sgGet(path);
  const emptyArray = Array.isArray(body) && body.length === 0;
  const emptyObject =
    body && !Array.isArray(body) && typeof body === "object" && Object.keys(body).length === 0;
  const populatedArray = Array.isArray(body) && body.length > 0;
  const populatedObject =
    body && !Array.isArray(body) && typeof body === "object" && body.recipient_email;

  if (status === 200 && (populatedArray || populatedObject)) {
    anyMatch = true;
    console.log(`❌ ${name} — SUPPRESSED`);
    if (populatedArray) {
      for (const entry of body) console.log("   ", JSON.stringify(entry));
    } else {
      console.log("   ", JSON.stringify(body));
    }
  } else if (status === 404 || (status === 200 && (emptyArray || emptyObject))) {
    console.log(`✅ ${name} — not on this list`);
  } else if (status === 401 || status === 403) {
    console.log(
      `⚠️  ${name} — auth/permission error (${status}). Your SENDGRID_API_KEY may not have Suppression Management scopes.`,
    );
    console.log("   ", JSON.stringify(body));
  } else {
    console.log(`⚠️  ${name} — unexpected response (${status})`);
    console.log("   ", JSON.stringify(body));
  }
}

console.log();

const sendersRes = await sgGet("/verified_senders");
if (sendersRes.status === 200 && sendersRes.body?.results) {
  const senderEmail = (process.env.SENDGRID_FROM_EMAIL || "").trim().toLowerCase();
  console.log("Verified Senders in this SendGrid account:");
  for (const s of sendersRes.body.results) {
    const marker = s.from_email?.toLowerCase() === senderEmail ? "  ← your SENDGRID_FROM_EMAIL" : "";
    console.log(`   ${s.verified ? "✅" : "❌"} ${s.from_email}   (${s.from_name || "no name"})${marker}`);
  }
} else if (sendersRes.status === 401 || sendersRes.status === 403) {
  console.log(
    "⚠️  Could not list verified senders — your SENDGRID_API_KEY lacks 'Sender Authentication' read scope.",
  );
} else {
  console.log(`⚠️  Verified senders lookup failed (${sendersRes.status})`);
}

console.log();
if (!anyMatch) {
  console.log("Diagnosis: this address is not on any SendGrid suppression list, which means");
  console.log("SendGrid did not actively reject it. Most likely remaining causes:");
  console.log();
  console.log("  1. Supabase isn't actually using your custom SMTP. Verify:");
  console.log("       Supabase Dashboard → Authentication → Emails → SMTP Settings");
  console.log("       • 'Enable Custom SMTP' toggle is ON");
  console.log("       • Host: smtp.sendgrid.net");
  console.log("       • Port: 587");
  console.log("       • Username: literal string  apikey");
  console.log("       • Password: full SendGrid API key starting SG.");
  console.log("       • Sender email: an address that appears in the verified-senders list above");
  console.log("       • Sender name: anything (e.g. 'convene')");
  console.log("     After changing anything here, click 'Save' explicitly.");
  console.log();
  console.log("  2. Look at Supabase Dashboard → Logs → Auth Logs around the");
  console.log("     `confirmation_sent_at` timestamp from the other diagnostic. A failed SMTP");
  console.log("     handshake will appear there as 'mailer_smtp_error' / 'mail_send_error'");
  console.log("     and tells you exactly what SendGrid said. This is the smoking gun if it's there.");
  console.log();
  console.log("  3. Open SendGrid Activity Feed:");
  console.log(`       https://app.sendgrid.com/email_activity?search=${encodeURIComponent(target)}`);
  console.log("     If the message is there: hover for status (Processed / Delivered / Deferred /");
  console.log("     Dropped). If it's NOT there at all: Supabase isn't reaching SendGrid (point 1).");
}
