import { createAdminClient } from "@/lib/supabase/admin";
import { displayName, getAuthedUserId, getUsersByIds } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { persistBookingDependability } from "@/lib/dependability-persist";
import { dispatchBookingNoShowAlert } from "@/lib/notifications/admin-alerts";
import {
  isTerminalSessionStatus,
  resolveManualSessionEndStatus,
  type SessionEndStatus,
} from "@/lib/resolveManualSessionEndStatus";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function refundReviewStatusForEnd(
  status: SessionEndStatus,
  prevRefund: string | null | undefined,
): "none" | "pending" | "resolved" {
  if (status !== "no_show_expert") return "none";
  if (prevRefund === "resolved") return "resolved";
  return "pending";
}

/** Participant ends the session early; status follows join timestamps and 10-minute no-show grace. */
export async function POST(_request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bookingId } = await params;
  const admin = createAdminClient();
  const { data: b, error } = await admin
    .from("bookings")
    .select(
      "booking_id, learner_user_id, expert_user_id, learner_joined, expert_joined, status, session_date, start_time, cancelled_at, refund_review_status",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });
  if (!b) return Response.json({ error: "Booking not found" }, { status: 404 });
  if (b.learner_user_id !== userId && b.expert_user_id !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentStatus = String(b.status ?? "").toLowerCase();
  if (isTerminalSessionStatus(currentStatus)) {
    return Response.json({
      ok: true,
      alreadyFinalized: true,
      status: currentStatus,
      booking: b,
    });
  }

  const resolved = resolveManualSessionEndStatus({
    session_date: String(b.session_date ?? ""),
    start_time: String(b.start_time ?? ""),
    learner_joined: b.learner_joined as string | null,
    expert_joined: b.expert_joined as string | null,
    status: b.status as string | null,
    cancelled_at: b.cancelled_at as string | null,
  });

  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: 400 });
  }

  const status = resolved.status;
  const refund_review_status = refundReviewStatusForEnd(
    status,
    b.refund_review_status as string | null,
  );

  const { data: updated, error: upErr } = await admin
    .from("bookings")
    .update({
      status,
      refund_review_status,
      updated_at: new Date().toISOString(),
    })
    .eq("booking_id", bookingId)
    .select("*")
    .maybeSingle();

  if (upErr) return Response.json({ error: publicApiError(upErr) }, { status: 500 });
  if (!updated) return Response.json({ error: "Booking not found" }, { status: 404 });

  try {
    await persistBookingDependability(admin, bookingId);
  } catch {
    /* non-fatal */
  }

  if (status === "no_show_expert" && refund_review_status === "pending") {
    try {
      const users = await getUsersByIds([b.learner_user_id, b.expert_user_id]);
      const learner = users.find((u) => u.user_id === b.learner_user_id);
      const expert = users.find((u) => u.user_id === b.expert_user_id);
      await dispatchBookingNoShowAlert({
        bookingId,
        sessionDate: String(b.session_date),
        startTime: String(b.start_time),
        learnerName: learner ? displayName(learner) : null,
        expertName: expert ? displayName(expert) : null,
      });
    } catch {
      /* best-effort */
    }
  }

  return Response.json({ ok: true, status, booking: updated });
}
