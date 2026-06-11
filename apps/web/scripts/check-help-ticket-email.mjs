import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue;
  if (!process.env[trimmed.slice(0, eq)]) {
    process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
}

const ticketId = process.argv[2];
if (!ticketId) {
  console.error("Usage: node scripts/check-help-ticket-email.mjs <ticketId>");
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: ticket, error: tErr } = await admin
  .from("help_tickets")
  .select("ticket_id, submitter_email, submitter_name, subject")
  .eq("ticket_id", ticketId)
  .maybeSingle();

if (tErr) {
  console.error("Ticket query error:", tErr.message);
  process.exit(1);
}
if (!ticket) {
  console.error("Ticket not found");
  process.exit(1);
}

const { data: messages, error: mErr } = await admin
  .from("help_ticket_messages")
  .select("message_id, author, body, email_sent_at, created_at")
  .eq("ticket_id", ticketId)
  .order("created_at", { ascending: false })
  .limit(5);

if (mErr) {
  console.error("Messages error:", mErr.message);
  process.exit(1);
}

console.log("Ticket:", ticket.ticket_id);
console.log("Submitter email (where SendGrid sends):", ticket.submitter_email);
console.log("Submitter name:", ticket.submitter_name || "(none)");
console.log("Subject:", ticket.subject);
console.log("--- Recent admin replies ---");
for (const m of messages ?? []) {
  if (m.author !== "admin") continue;
  console.log({
    created_at: m.created_at,
    email_sent_at: m.email_sent_at ?? "NULL (SendGrid did not succeed)",
    preview: String(m.body).slice(0, 60),
  });
}
