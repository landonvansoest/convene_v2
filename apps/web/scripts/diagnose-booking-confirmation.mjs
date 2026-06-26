/**
 * Diagnose why booking confirmation emails did not arrive.
 *
 * Usage (from apps/web):
 *   node scripts/diagnose-booking-confirmation.mjs <booking_id>
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

const bookingId = (process.argv[2] || "").trim();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const sendgridKey = process.env.SENDGRID_API_KEY?.trim();
const sendgridFrom = process.env.SENDGRID_FROM_EMAIL?.trim();

if (!bookingId) {
  console.error("Usage: node scripts/diagnose-booking-confirmation.mjs <booking_id>");
  process.exit(1);
}
if (!supabaseUrl || !serviceKey) {
  console.error("FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function sbGet(path) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

console.log("Booking confirmation email diagnostic");
console.log("===================================");
console.log();

console.log("SendGrid:");
console.log("  SENDGRID_API_KEY:", sendgridKey ? "set" : "MISSING");
console.log("  SENDGRID_FROM_EMAIL:", sendgridFrom || "MISSING");
console.log();

const bookingRes = await sbGet(
  `bookings?booking_id=eq.${encodeURIComponent(bookingId)}&select=booking_id,payment_status,confirmation_notified_at,expert_user_id,learner_user_id,session_date,start_time,created_at`,
);
const booking = Array.isArray(bookingRes.body) ? bookingRes.body[0] : null;
if (!booking) {
  console.error("FAIL: booking not found", bookingId);
  process.exit(1);
}

console.log("Booking:");
console.log("  payment_status:", booking.payment_status);
console.log("  confirmation_notified_at:", booking.confirmation_notified_at ?? "(null)");
console.log("  session:", booking.session_date, booking.start_time);
console.log();

if (booking.payment_status !== "paid") {
  console.warn("WARN: payment_status is not paid — confirmation emails only send after payment.");
}

if (booking.confirmation_notified_at && (!sendgridKey || !sendgridFrom)) {
  console.warn(
    "WARN: confirmation_notified_at is set but SendGrid is not configured.",
  );
  console.warn(
    "      Emails may have been skipped earlier. To retry:",
  );
  console.warn(
    `      UPDATE bookings SET confirmation_notified_at = NULL WHERE booking_id = '${bookingId}';`,
  );
  console.warn(
    "      Then trigger GET /api/notifications/check-booking-confirmations with CRON_SECRET.",
  );
}

const userIds = [booking.expert_user_id, booking.learner_user_id].filter(Boolean);
const usersRes = await sbGet(
  `users?user_id=in.(${userIds.join(",")})&select=user_id,first_name,last_name,email_address`,
);
const users = Array.isArray(usersRes.body) ? usersRes.body : [];
console.log("Parties:");
for (const u of users) {
  const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "(no name)";
  console.log(`  ${u.user_id}: ${name} <${u.email_address || "NO EMAIL"}>`);
}
console.log();

const tplRes = await sbGet(
  `message_templates?automation_key=in.(booking_confirmed,new_booking)&select=automation_key,email_enabled,email_subject`,
);
const templates = Array.isArray(tplRes.body) ? tplRes.body : [];
console.log("Templates:");
if (templates.length === 0) {
  console.log("  (no rows — code fallbacks apply with email_enabled=true)");
} else {
  for (const t of templates) {
    console.log(`  ${t.automation_key}: email_enabled=${t.email_enabled}`);
  }
}
console.log();

console.log("Next steps:");
if (!sendgridKey || !sendgridFrom) {
  console.log("  1. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in .env.local / Vercel env.");
}
if (booking.confirmation_notified_at) {
  console.log("  2. Clear confirmation_notified_at for this booking (SQL above) to allow a resend.");
} else {
  console.log("  2. Run: npx tsx scripts/retry-pending-booking-confirmations.mjs");
  console.log("     Or trigger GET /api/notifications/check-booking-confirmations with CRON_SECRET.");
}
console.log("  3. Watch server logs for [notifications] SendGrid error (calendar .ics issues retry without attachment).");
