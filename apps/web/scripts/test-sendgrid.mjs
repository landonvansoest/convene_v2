/**
 * One-off SendGrid smoke test. Usage (from apps/web):
 *   node scripts/test-sendgrid.mjs [recipient@email.com]
 * Loads .env.local; does not print secrets.
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
const from = process.env.SENDGRID_FROM_EMAIL?.trim();
const to = (process.argv[2] || process.env.ADMIN_EMAIL || "").trim();

if (!apiKey) {
  console.error("FAIL: SENDGRID_API_KEY missing in .env.local");
  process.exit(1);
}
if (!from) {
  console.error("FAIL: SENDGRID_FROM_EMAIL missing in .env.local");
  process.exit(1);
}
if (!to) {
  console.error("FAIL: pass recipient email as argv[2] or set ADMIN_EMAIL");
  process.exit(1);
}

console.log("From:", from);
console.log("To:", to);
console.log("API key present:", apiKey.startsWith("SG.") ? "yes (SG.*)" : "yes (unexpected format)");

const sg = (await import("@sendgrid/mail")).default;
sg.setApiKey(apiKey);

try {
  const [res] = await sg.send({
    to,
    from,
    subject: "Convene SendGrid smoke test",
    text: "If you received this, SendGrid is working from your local env.",
  });
  console.log("SUCCESS — SendGrid accepted the message.");
  console.log("Status:", res?.statusCode ?? "unknown");
} catch (e) {
  console.error("FAIL — SendGrid rejected the send.");
  if (e.response?.body) {
    console.error(JSON.stringify(e.response.body, null, 2));
  } else {
    console.error(e.message || e);
  }
  process.exit(1);
}
