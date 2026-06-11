import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { getAuthedUserId } from "@/lib/messages/service";
import { durationMinutesBetweenWallTimes, normalizeWallTimeForPg } from "@/lib/offers/session-time";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["accept", "decline"]),
});

type Params = { params: Promise<{ offerId: string }> };

export async function POST(request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { offerId } = await params;
  if (!offerId) {
    return Response.json({ error: "Missing offer id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const { action } = parsed.data;
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: offer, error: offerErr } = await admin
    .from("offers")
    .select("*")
    .eq("offer_id", offerId)
    .maybeSingle();

  if (offerErr) {
    return Response.json({ error: publicApiError(offerErr) }, { status: 500 });
  }
  if (!offer) {
    return Response.json({ error: "Offer not found" }, { status: 404 });
  }

  if (offer.to_user_id !== userId) {
    return Response.json({ error: "Only the recipient can respond" }, { status: 403 });
  }

  if (offer.offer_type !== "time_suggestion") {
    return Response.json({ error: "This offer type cannot be accepted here" }, { status: 400 });
  }

  if (offer.status !== "offered") {
    return Response.json({ error: "This offer is no longer open" }, { status: 409 });
  }

  const payload = (offer.payload ?? {}) as Record<string, unknown>;
  const bookingId =
    typeof payload.related_booking_id === "string" ? payload.related_booking_id : null;
  if (!bookingId) {
    return Response.json({ error: "Offer is missing booking reference" }, { status: 400 });
  }

  const { data: booking, error: boErr } = await admin
    .from("bookings")
    .select(
      "booking_id, reschedule_request_id, learner_user_id, expert_user_id, pending_reschedule_date",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (boErr) {
    return Response.json({ error: publicApiError(boErr) }, { status: 500 });
  }
  if (!booking) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }

  if (!booking.reschedule_request_id) {
    return Response.json(
      { error: "No pending reschedule is active for this booking" },
      { status: 409 },
    );
  }

  const { data: reqMsg, error: msgErr } = await admin
    .from("messages")
    .select("message_id, metadata")
    .eq("message_id", booking.reschedule_request_id)
    .maybeSingle();

  if (msgErr) {
    return Response.json({ error: publicApiError(msgErr) }, { status: 500 });
  }

  const linkedOfferId =
    reqMsg?.metadata && typeof (reqMsg.metadata as { offer_id?: unknown }).offer_id === "string"
      ? (reqMsg.metadata as { offer_id: string }).offer_id
      : null;

  if (linkedOfferId !== offerId) {
    return Response.json(
      { error: "This reschedule was superseded by a newer request" },
      { status: 409 },
    );
  }

  if (action === "decline") {
    // Bible §"Dependability Rating": the reschedule-suggestion penalty
    // applies the moment the suggestion was sent and persists regardless of
    // accept/decline. We intentionally do NOT clear reschedule_request_id
    // here — it stays as the historical anchor for the per-booking score.
    const { error: upBo } = await admin
      .from("bookings")
      .update({
        pending_reschedule_date: null,
        pending_reschedule_start_time: null,
        pending_reschedule_end_time: null,
        updated_at: nowIso,
      })
      .eq("booking_id", bookingId);

    if (upBo) {
      return Response.json({ error: publicApiError(upBo) }, { status: 500 });
    }

    const { error: upOf } = await admin
      .from("offers")
      .update({ status: "denied", updated_at: nowIso })
      .eq("offer_id", offerId);

    if (upOf) {
      return Response.json({ error: publicApiError(upOf) }, { status: 500 });
    }

    return Response.json({ ok: true, status: "denied" as const });
  }

  const dateRaw = payload.proposed_session_date ?? payload.session_date;
  const sessionDate = typeof dateRaw === "string" ? dateRaw.trim() : "";
  const st = normalizeWallTimeForPg(payload.start_time);
  const et = normalizeWallTimeForPg(payload.end_time);

  if (!sessionDate || !st || !et) {
    return Response.json({ error: "Offer payload is missing date or times" }, { status: 400 });
  }

  const durationMinutes = durationMinutesBetweenWallTimes(st, et);
  if (durationMinutes == null) {
    return Response.json({ error: "Invalid start/end times in offer" }, { status: 400 });
  }

  // Bible §"Dependability Rating": keep reschedule_request_id intact even on
  // accept so the per-booking dependability score still reflects the original
  // suggestion penalty. Only the open-proposal columns are cleared.
  const { error: upBo } = await admin
    .from("bookings")
    .update({
      session_date: sessionDate,
      start_time: st,
      end_time: et,
      duration: `${durationMinutes} minutes`,
      pending_reschedule_date: null,
      pending_reschedule_start_time: null,
      pending_reschedule_end_time: null,
      updated_at: nowIso,
    })
    .eq("booking_id", bookingId);

  if (upBo) {
    return Response.json({ error: publicApiError(upBo) }, { status: 500 });
  }

  const { error: upOf } = await admin
    .from("offers")
    .update({ status: "accepted", updated_at: nowIso })
    .eq("offer_id", offerId);

  if (upOf) {
    return Response.json({ error: publicApiError(upOf) }, { status: 500 });
  }

  return Response.json({ ok: true, status: "accepted" as const });
}
