/**
 * Raw SMTP smoke test against SendGrid using the EXACT same protocol Supabase Auth
 * uses (smtp.sendgrid.net:587, STARTTLS, AUTH LOGIN with username 'apikey'
 * + your API key as the password).
 *
 * Usage (from apps/web):
 *   node scripts/test-sendgrid-smtp.mjs recipient@example.com
 *
 * If this script delivers but Supabase Auth doesn't, the credentials saved in
 *   Supabase Dashboard → Authentication → Emails → SMTP Settings
 * are wrong (typo, partial paste, or 'Enable Custom SMTP' toggle never saved).
 *
 * If this script ALSO fails, the SMTP server response shown in the conversation log
 * will tell us why (bad API key, sender not verified, etc.) — same response Supabase
 * would see.
 *
 * Reads SENDGRID_API_KEY + SENDGRID_FROM_EMAIL from apps/web/.env.local. Prints the
 * full SMTP conversation so you can see exactly what SendGrid said. The API key is
 * never printed (substituted with "<redacted>" in the AUTH lines).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "node:net";
import { connect as tlsConnect } from "node:tls";

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
const to = (process.argv[2] || "").trim();

if (!apiKey) {
  console.error("FAIL: SENDGRID_API_KEY missing in .env.local");
  process.exit(1);
}
if (!from) {
  console.error("FAIL: SENDGRID_FROM_EMAIL missing in .env.local");
  process.exit(1);
}
if (!to) {
  console.error("FAIL: pass a recipient email as argv[2]");
  console.error("  node scripts/test-sendgrid-smtp.mjs you@example.com");
  process.exit(1);
}

const HOST = "smtp.sendgrid.net";
const PORT = 587;

console.log(`SMTP test → ${HOST}:${PORT}`);
console.log(`From: ${from}`);
console.log(`To:   ${to}`);
console.log(`API key prefix: ${apiKey.slice(0, 3)}*** (length ${apiKey.length})`);
console.log();

function decode(buf) {
  return buf.toString("utf8");
}

function send(socket, line, censor = false) {
  console.log(`C: ${censor ? "<redacted>" : line.replace(/\r?\n$/, "")}`);
  socket.write(line);
}

function waitFor(socket, expectedCode) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk) => {
      buf += decode(chunk);
      const lines = buf.split(/\r\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      if (!last) return;
      // Multi-line responses use "<code>-..." for non-final lines and "<code> ..." for the final line
      if (/^\d{3}[\s].*/.test(last)) {
        socket.removeListener("data", onData);
        for (const ln of lines) console.log(`S: ${ln}`);
        const code = parseInt(last.slice(0, 3), 10);
        if (Array.isArray(expectedCode) ? expectedCode.includes(code) : code === expectedCode) {
          resolve(lines);
        } else {
          reject(new Error(`Expected ${expectedCode}, got ${code}: ${last}`));
        }
      }
    };
    socket.on("data", onData);
    socket.once("error", (err) => reject(err));
  });
}

async function main() {
  // 1. Plain TCP connect to 587
  const plain = connect({ host: HOST, port: PORT });
  plain.setEncoding(null);

  await new Promise((resolve, reject) => {
    plain.once("connect", resolve);
    plain.once("error", reject);
  });

  await waitFor(plain, 220);
  send(plain, `EHLO convene-smtp-test\r\n`);
  await waitFor(plain, 250);

  send(plain, `STARTTLS\r\n`);
  await waitFor(plain, 220);

  // 2. Upgrade to TLS over the same socket
  const tls = tlsConnect({ socket: plain, servername: HOST });
  await new Promise((resolve, reject) => {
    tls.once("secureConnect", resolve);
    tls.once("error", reject);
  });

  send(tls, `EHLO convene-smtp-test\r\n`);
  await waitFor(tls, 250);

  send(tls, `AUTH LOGIN\r\n`);
  await waitFor(tls, 334);

  send(tls, `${Buffer.from("apikey").toString("base64")}\r\n`);
  await waitFor(tls, 334);

  send(tls, `${Buffer.from(apiKey).toString("base64")}\r\n`, true);
  await waitFor(tls, 235);

  send(tls, `MAIL FROM:<${from}>\r\n`);
  await waitFor(tls, 250);

  send(tls, `RCPT TO:<${to}>\r\n`);
  await waitFor(tls, 250);

  send(tls, `DATA\r\n`);
  await waitFor(tls, 354);

  const subject = "Convene Supabase-style SMTP smoke test";
  const body =
    "If you received this, your SendGrid SMTP credentials are working.\r\n" +
    "Supabase Auth uses the same credentials to send signup-confirmation emails.\r\n" +
    "If this arrives but real signups don't, the credentials in Supabase Dashboard\r\n" +
    "→ Authentication → Emails → SMTP Settings are not the same as .env.local.\r\n";

  const message =
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `\r\n` +
    body +
    `\r\n.\r\n`;

  // We don't want to log the full body; just announce the DATA block
  console.log(`C: <message body ${message.length} bytes, terminated by CRLF.CRLF>`);
  tls.write(message);
  await waitFor(tls, 250);

  send(tls, `QUIT\r\n`);
  await waitFor(tls, [221, 250]).catch(() => {});

  tls.end();
  console.log();
  console.log("✅ SUCCESS — SendGrid SMTP accepted the message via 587/STARTTLS.");
  console.log("   If this email doesn't arrive at the recipient inbox, check SendGrid Activity Feed.");
  console.log("   If Supabase signups still don't deliver, the credentials in the Supabase");
  console.log("   Dashboard differ from .env.local — re-enter them carefully and click Save.");
  process.exit(0);
}

main().catch((err) => {
  console.log();
  console.error("❌ FAIL —", err.message);
  console.error();
  console.error("Interpret SendGrid's response above:");
  console.error("  • '535 Authentication failed': API key wrong, revoked, or lacks Mail Send scope.");
  console.error("  • '550 The from address does not match a Verified Sender Identity': sender not");
  console.error("    verified in SendGrid → Sender Authentication. Fix it there.");
  console.error("  • '454 Try again later' / '421 ...': transient — wait a minute and retry.");
  console.error("  • Network timeout: outbound port 587 blocked on this network.");
  process.exit(1);
});
