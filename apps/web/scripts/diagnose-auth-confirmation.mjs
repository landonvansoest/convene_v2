/**
 * Diagnose Supabase Auth email-confirmation delivery problems for signups.
 *
 * Usage (from apps/web):
 *   node scripts/diagnose-auth-confirmation.mjs                 # list 10 most recent auth.users (unconfirmed first)
 *   node scripts/diagnose-auth-confirmation.mjs you+test@x.com  # show that user + generate a fresh signup confirmation link
 *
 * What it tells you:
 *   - Did Supabase actually create the auth.user? (rules out a frontend issue)
 *   - Is the row marked `confirmed_at` / `email_confirmed_at`? (rules out the user clicking already)
 *   - Did Supabase stamp `confirmation_sent_at`? If yes → Supabase HANDED the email to its mailer;
 *     missing inbox = SendGrid/SMTP delivery problem. If no → Supabase never tried to send (rate limit,
 *     Confirm email OFF, or the user already existed and was deduped).
 *   - Generates a working confirmation link via the admin API so you can finish the flow without an email.
 *
 * No secrets are printed. Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from apps/web/.env.local.
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

if (!supabaseUrl) {
  console.error("FAIL: NEXT_PUBLIC_SUPABASE_URL missing in .env.local");
  process.exit(1);
}
if (!serviceKey) {
  console.error("FAIL: SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const targetEmail = (process.argv[2] || "").trim().toLowerCase();

function fmtDate(v) {
  if (!v) return "—";
  try {
    return new Date(v).toISOString();
  } catch {
    return String(v);
  }
}

function summarizeUser(u) {
  return {
    id: u.id,
    email: u.email,
    created_at: fmtDate(u.created_at),
    email_confirmed_at: fmtDate(u.email_confirmed_at),
    confirmed_at: fmtDate(u.confirmed_at),
    confirmation_sent_at: fmtDate(u.confirmation_sent_at),
    last_sign_in_at: fmtDate(u.last_sign_in_at),
    identities: (u.identities || []).map((i) => i.provider),
  };
}

if (!targetEmail) {
  console.log("Listing 25 most recent auth.users (most useful: 'confirmation_sent_at' column).\n");
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 25 });
  if (error) {
    console.error("FAIL listing users:", error.message);
    process.exit(1);
  }
  const rows = data.users
    .map(summarizeUser)
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
  console.table(
    rows.map((r) => ({
      email: r.email,
      created_at: r.created_at,
      confirmation_sent_at: r.confirmation_sent_at,
      email_confirmed_at: r.email_confirmed_at,
    })),
  );
  console.log("\nNext step:");
  console.log("  node scripts/diagnose-auth-confirmation.mjs <one-of-the-emails-above>");
  console.log("  → that will print full detail + generate a working confirmation link.");
  process.exit(0);
}

console.log(`Looking up: ${targetEmail}`);
const { data: listData, error: listErr } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (listErr) {
  console.error("FAIL listing users:", listErr.message);
  process.exit(1);
}
const found = listData.users.find((u) => (u.email || "").toLowerCase() === targetEmail);

if (!found) {
  console.log("\nNo auth.user exists with that email.");
  console.log("Interpretation:");
  console.log(
    "  • If you JUST tried signing up with it, the signUp() call failed before reaching Supabase",
  );
  console.log(
    "    (network error, blocked CORS, etc.) — check the browser network tab on the signup request.",
  );
  console.log(
    "  • If you've used this email before AND it's not in the table, it was likely deleted.",
  );
  process.exit(0);
}

console.log("\nFull row:");
console.log(JSON.stringify(summarizeUser(found), null, 2));

console.log("\nDiagnosis:");
if (found.email_confirmed_at || found.confirmed_at) {
  console.log("  ✅ User is ALREADY confirmed. No email was sent on the most recent signUp() call");
  console.log("     because the account exists and is already verified — Supabase silently no-ops");
  console.log("     in that case. Sign in with email + password directly to test.");
} else if (!found.confirmation_sent_at) {
  console.log(
    "  ⚠️  Supabase has NOT recorded a confirmation_sent_at — it did not hand an email to the mailer.",
  );
  console.log("     Most likely causes:");
  console.log("       • 'Confirm email' is OFF in Authentication → Sign In / Up → Email");
  console.log("       • You re-signed-up with an email that already exists (Supabase dedupes silently)");
  console.log("       • You hit the per-hour auth email rate limit (default 30/hour)");
} else {
  console.log("  📨 Supabase DID hand off the email to its mailer at", fmtDate(found.confirmation_sent_at));
  console.log("     The fact that you didn't receive it means the SMTP layer dropped or bounced it.");
  console.log("     Check, in this order:");
  console.log("       1. Supabase Dashboard → Logs → Auth Logs → filter on this email, look for");
  console.log("          'mailer_smtp_error' / 'mail_send_error' (this is the smoking gun)");
  console.log("       2. SendGrid → Activity Feed (https://app.sendgrid.com/email_activity) →");
  console.log("          search for this email. If it's not there at all, Supabase isn't using your");
  console.log("          custom SMTP — verify Authentication → Emails → SMTP Settings → 'Enable Custom");
  console.log("          SMTP' is ON and the host/port/username/password were saved.");
  console.log("       3. If SendGrid shows 'Bounced' or 'Blocked' for this address, look at the reason —");
  console.log("          usually sender identity / domain authentication.");
}

console.log("\nGenerating a fresh signup confirmation link via the admin API…");
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "signup",
  email: targetEmail,
  options: { redirectTo: `${appUrl}/auth/callback/signup/complete` },
});
if (linkErr) {
  console.log("  Could not generate signup link:", linkErr.message);
  console.log("  (This is expected if the user is already confirmed — try `type: 'magiclink'` instead.)");
} else {
  const link = linkData?.properties?.action_link;
  if (link) {
    console.log("  ✅ Link generated. Paste this into your browser to finish verifying without an email:\n");
    console.log("    " + link);
    console.log(
      "\n  ⚠️  Treat this like a password — anyone with this link can take over the account.",
    );
  } else {
    console.log("  Generated, but no action_link in response:", JSON.stringify(linkData, null, 2));
  }
}
