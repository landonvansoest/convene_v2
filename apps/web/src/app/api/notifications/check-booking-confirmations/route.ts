import { cronAuth } from "@/lib/notifications/cron-auth";
import { dispatchPendingBookingConfirmations } from "@/lib/notifications/booking-notifications";
import { isSendGridConfigured } from "@/lib/notifications/send-channels";

export const dynamic = "force-dynamic";

/**
 * Retry booking confirmation emails for paid bookings that were never marked notified.
 * Auth: Bearer CRON_SECRET or ?secret=
 */
export async function GET(request: Request) {
  if (!cronAuth(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await dispatchPendingBookingConfirmations(25);
  return Response.json({
    ok: true,
    sendgrid_configured: isSendGridConfigured(),
    ...result,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
