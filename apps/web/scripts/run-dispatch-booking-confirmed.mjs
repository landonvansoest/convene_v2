/**
 * Dev helper: run dispatchBookingConfirmed for a booking id (loads .env.local).
 * Usage: npx tsx scripts/run-dispatch-booking-confirmed.mjs <booking_id>
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
if (!bookingId) {
  console.error("Usage: npx tsx scripts/run-dispatch-booking-confirmed.mjs <booking_id>");
  process.exit(1);
}

const { dispatchBookingConfirmed } = await import("../src/lib/notifications/booking-notifications.ts");
console.log("dispatchBookingConfirmed", bookingId);
await dispatchBookingConfirmed(bookingId);
console.log("finished");
