import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const filePath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(filePath)) {
    console.error("Missing apps/web/.env.local");
    process.exit(1);
  }
  const txt = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of txt.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function curlBlock({ me, recipient, expert, booking }) {
  const base = "http://localhost:3000";
  const room = `convene-smoke-${Date.now()}`;

  console.log("\n--- Paste-safe curls (run dev server: npm run dev) ---\n");
  console.log(
    `curl -i -X POST "${base}/api/messages" \\\n  -H "Content-Type: application/json" \\\n  -d '{"recipientId":"${recipient}","subject":"Test","messageBody":"Smoke test"}'`
  );
  console.log("\n");

  if (booking) {
    console.log(
      `curl -i -X PUT "${base}/api/messages/MESSAGE_UUID_AFTER_POST/read"`
    );
    console.log("(Replace MESSAGE_UUID_AFTER_POST with id from POST /api/messages response.)\n");
  }

  if (expert) {
    console.log(
      `curl -i -X POST "${base}/api/sessions" \\\n  -H "Content-Type: application/json" \\\n  -d '{"expertId":"${expert}","sessionDate":"2026-03-25","startTime":"10:00:00","endTime":"11:00:00","durationMinutes":60,"totalPrice":100}'`
    );
    console.log("\n");
  } else {
    console.log(
      "# No expert_profiles row found — create one in Supabase, then rerun this script for POST /api/sessions.\n"
    );
  }

  if (booking) {
    console.log(
      `curl -i -X PUT "${base}/api/sessions/${booking}/status" \\\n  -H "Content-Type: application/json" \\\n  -d '{"status":"cancelled","cancellationReason":"Smoke test"}'`
    );
    console.log("\n");
  } else {
    console.log(
      "# No bookings row found — create a session first, or skip status PUT.\n"
    );
  }

  console.log(
    `curl -i -X PUT "${base}/api/experts/availability" \\\n  -H "Content-Type: application/json" \\\n  -d '{"minDuration":30,"maxDuration":120,"hourlyRate":150,"weeklySchedule":{},"dateOverrides":[]}'`
  );
  console.log("\n");

  console.log(
    `curl -i -X POST "${base}/api/video/ensure-room" \\\n  -H "Content-Type: application/json" \\\n  -d '{"roomName":"${room}","expSeconds":3600}'`
  );
  console.log("\n");

  console.log("--- UUIDs used ---");
  console.log(`ME (your DB user for reference):     ${me}`);
  console.log(`RECIPIENT (messages recipient):      ${recipient}`);
  console.log(`EXPERT (sessions):                   ${expert ?? "(none)"}`);
  console.log(`BOOKING (status PUT):                ${booking ?? "(none)"}`);
  console.log(
    "\nNote: POST/PUT need a logged-in session. For curl, add -H \"Cookie: ...\" from browser after login,\nor use Postman with cookies.\n"
  );
}

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const emailFilter = process.env.SMOKE_EMAIL?.trim().toLowerCase();

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: users, error: usersErr } = await admin
    .from("users")
    .select("user_id, email_address")
    .limit(20);
  if (usersErr) {
    console.error(usersErr.message);
    process.exit(1);
  }
  if (!users?.length) {
    console.error("No rows in public.users");
    process.exit(1);
  }

  let me = users[0].user_id;
  if (emailFilter) {
    const found = users.find(
      (u) => (u.email_address ?? "").toLowerCase() === emailFilter
    );
    if (found) me = found.user_id;
  }

  const others = users.filter((u) => u.user_id !== me);
  if (!others.length) {
    console.error("Need at least two users in public.users for recipient.");
    process.exit(1);
  }
  const recipient = others[0].user_id;

  const { data: experts } = await admin
    .from("expert_profiles")
    .select("user_id")
    .limit(1);

  const expert = experts?.[0]?.user_id ?? null;

  const { data: bookings } = await admin
    .from("bookings")
    .select("booking_id")
    .limit(1);
  const booking = bookings?.[0]?.booking_id ?? null;

  curlBlock({ me, recipient, expert, booking });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
