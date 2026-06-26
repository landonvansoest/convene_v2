/**
 * Retry booking confirmation emails for paid bookings missing confirmation_notified_at.
 * Usage: npx tsx scripts/retry-pending-booking-confirmations.mjs [limit]
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

const limit = Math.min(Number(process.argv[2] ?? 50) || 50, 100);
const { dispatchPendingBookingConfirmations } = await import(
  "../src/lib/notifications/booking-notifications.ts"
);

console.log(`Retrying up to ${limit} pending booking confirmation(s)...`);
const result = await dispatchPendingBookingConfirmations(limit);
console.log(result);
