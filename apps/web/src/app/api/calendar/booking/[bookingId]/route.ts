import { publicApiError } from "@/lib/api/public-error";
import { buildBookingIcs } from "@/lib/notifications/booking-ics";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function appBaseUrl(): string {
  return (
    (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")) ||
    "http://localhost:3000"
  );
}

function parseBookingId(raw: string): string {
  return raw.replace(/\.ics$/i, "").trim();
}

function displayName(row: {
  first_name: string | null;
  last_name: string | null;
  email_address: string | null;
}): string {
  const n = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return n || row.email_address || "User";
}

type Params = { params: Promise<{ bookingId: string }> };

/** Public .ics download for a paid booking (UUID is the access token). */
export async function GET(_request: Request, { params }: Params) {
  const bookingId = parseBookingId((await params).bookingId);
  if (!bookingId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: booking, error } = await admin
    .from("bookings")
    .select(
      "booking_id, session_date, start_time, end_time, duration, status, payment_status, expert_user_id, learner_user_id",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!booking) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const paymentStatus = String(booking.payment_status ?? "").toLowerCase();
  if (paymentStatus !== "paid" && paymentStatus !== "succeeded") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const status = String(booking.status ?? "").toLowerCase();
  if (status === "cancelled" || status === "canceled") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { data: users } = await admin
    .from("users")
    .select("user_id, first_name, last_name, email_address, time_zone")
    .in("user_id", [booking.expert_user_id, booking.learner_user_id]);

  const expert = users?.find((u) => u.user_id === booking.expert_user_id);
  const learner = users?.find((u) => u.user_id === booking.learner_user_id);
  if (!expert || !learner) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const base = appBaseUrl();
  const sessionLink = `${base}/session/${booking.booking_id}`;
  const dashboardLink = `${base}/dashboard?view=sessions`;
  const expertName = displayName(expert);
  const learnerName = displayName(learner);
  const ics =
    buildBookingIcs({
      bookingId: booking.booking_id,
      sessionDate: String(booking.session_date),
      startTime: String(booking.start_time),
      endTime: booking.end_time,
      duration: booking.duration,
      timeZone: expert.time_zone ?? "UTC",
      summary: `Convene session with ${expertName} & ${learnerName}`,
      expertName,
      learnerName,
      sessionLink,
      dashboardLink,
      appHost: new URL(base).hostname,
    }) ?? null;

  if (!ics) {
    return Response.json({ error: "Could not build calendar event" }, { status: 500 });
  }

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="convene-session.ics"',
      "Cache-Control": "private, max-age=3600",
    },
  });
}
