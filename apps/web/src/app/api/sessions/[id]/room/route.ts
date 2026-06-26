import { ensureAppsWebEnvLoaded } from "@/lib/env/ensure-apps-web-env";
import { ensureDailyRoom } from "@/lib/daily/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { isSessionJoinWindowOpen } from "@/lib/sessionWallClock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function dailyRoomNameForBooking(bookingId: string) {
  return `booking-${bookingId}`.toLowerCase();
}

export async function POST(_request: Request, { params }: Params) {
  ensureAppsWebEnvLoaded();
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.DAILY_API_KEY?.trim();
  const dailyDomain =
    process.env.DAILY_DOMAIN ||
    process.env.NEXT_PUBLIC_DAILY_DOMAIN ||
    "videodemo.daily.co";

  if (!apiKey) {
    return Response.json({ error: "DAILY_API_KEY not configured on server" }, { status: 500 });
  }

  const { id: bookingId } = await params;
  const admin = createAdminClient();
  const { data: b, error } = await admin.from("bookings").select("*").eq("booking_id", bookingId).maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!b) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }
  if (b.learner_user_id !== userId && b.expert_user_id !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = String(b.status ?? "").toLowerCase();
  if (
    status === "upcoming" &&
    !isSessionJoinWindowOpen(String(b.session_date ?? ""), String(b.start_time ?? ""))
  ) {
    return Response.json(
      { error: "Your session is not active until 10 minutes before the scheduled start time." },
      { status: 403 },
    );
  }

  const roomName = dailyRoomNameForBooking(bookingId);
  let roomUrl: string;
  try {
    const out = await ensureDailyRoom({ apiKey, dailyDomain, roomName });
    roomUrl = out.roomUrl;
  } catch (e) {
    return Response.json({ error: publicApiError(e, "Video room error") }, { status: 502 });
  }

  const now = new Date().toISOString();
  await admin
    .from("bookings")
    .update({
      meeting_room_url: roomUrl,
      daily_room_id: roomName,
      updated_at: now,
    })
    .eq("booking_id", bookingId);

  return Response.json({ roomUrl, roomName });
}
