import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import {
  displayName,
  findOrCreateConversationForPair,
  getAuthedUserId,
  getUsersByIds,
  maybeDispatchMessageNotification,
} from "@/lib/messages/service";
import {
  createBookingFromSessionOffer,
  isSessionOfferPayload,
} from "@/lib/offers/create-booking-from-offer";
import { durationMinutesBetweenWallTimes, normalizeWallTimeForPg } from "@/lib/offers/session-time";
import { cancelBookingWithLearnerRefund } from "@/lib/bookings/cancel-booking-with-refund";
import { dispatchBookingRescheduleAccepted } from "@/lib/notifications/booking-notifications";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["accept", "decline"]),
});

type Params = { params: Promise<{ offerId: string }> };

function learnerFirstName(user: { first_name?: string | null } | undefined, fallback: string): string {
  const first = user?.first_name?.trim();
  if (first) return first.split(/\s+/)[0] ?? first;
  return fallback.split(/\s+/)[0] ?? fallback;
}

async function postDeclineThreadMessage(args: {
  admin: ReturnType<typeof createAdminClient>;
  learnerUserId: string;
  expertUserId: string;
  learnerFirstName: string;
  nowIso: string;
}) {
  const conversation = await findOrCreateConversationForPair(args.learnerUserId, args.expertUserId);
  const body = `${args.learnerFirstName} has declined your offer`;
  const { error: msgErr } = await args.admin.from("messages").insert({
    conversation_id: conversation.conversation_id,
    sender_id: args.learnerUserId,
    message: body,
    is_read: false,
    metadata: { offer_decline_notice: true },
  });
  if (msgErr) {
    return { ok: false as const, error: publicApiError(msgErr) };
  }
  await args.admin
    .from("conversations")
    .update({ updated_at: args.nowIso, last_message_at: args.nowIso })
    .eq("conversation_id", conversation.conversation_id);
  await maybeDispatchMessageNotification({
    senderId: args.learnerUserId,
    recipientId: args.expertUserId,
    messageBody: body,
  });
  return { ok: true as const };
}

async function acceptBookingReschedule(args: {
  admin: ReturnType<typeof createAdminClient>;
  offerId: string;
  payload: Record<string, unknown>;
  bookingId: string;
  nowIso: string;
}) {
  const { admin, offerId, payload, bookingId, nowIso } = args;

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

  try {
    await dispatchBookingRescheduleAccepted(bookingId);
  } catch (e) {
    console.error("[offers/respond] reschedule accepted notification failed", bookingId, e);
  }

  return Response.json({
    ok: true,
    status: "accepted" as const,
    requiresPayment: false,
    sessionDate,
    startTime: st,
    endTime: et,
  });
}

async function declineBookingReschedule(args: {
  admin: ReturnType<typeof createAdminClient>;
  offerId: string;
  bookingId: string;
  decliningUserId: string;
  nowIso: string;
}) {
  const { admin, offerId, bookingId, decliningUserId, nowIso } = args;

  const canceled = await cancelBookingWithLearnerRefund(admin, bookingId, decliningUserId);
  if (!canceled.ok) {
    return Response.json({ error: canceled.error }, { status: 502 });
  }

  const { error: upOf } = await admin
    .from("offers")
    .update({ status: "denied", updated_at: nowIso })
    .eq("offer_id", offerId);

  if (upOf) {
    return Response.json({ error: publicApiError(upOf) }, { status: 500 });
  }

  return Response.json({ ok: true, status: "denied" as const, bookingCanceled: true });
}

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

  if (offer.status !== "offered") {
    return Response.json({ error: "This offer is no longer open" }, { status: 409 });
  }

  const payload = (offer.payload ?? {}) as Record<string, unknown>;
  const bookingId =
    typeof payload.related_booking_id === "string" ? payload.related_booking_id : null;
  const expertUserId = String(offer.from_user_id);
  const learnerUserId = String(offer.to_user_id);

  if (action === "decline") {
    if (offer.offer_type === "time_suggestion" && bookingId) {
      return declineBookingReschedule({
        admin,
        offerId,
        bookingId,
        decliningUserId: userId,
        nowIso,
      });
    }

    const { error: upOf } = await admin
      .from("offers")
      .update({ status: "denied", updated_at: nowIso })
      .eq("offer_id", offerId);
    if (upOf) {
      return Response.json({ error: publicApiError(upOf) }, { status: 500 });
    }

    const [learner] = await getUsersByIds([learnerUserId]);
    const notice = await postDeclineThreadMessage({
      admin,
      learnerUserId,
      expertUserId,
      learnerFirstName: learnerFirstName(learner, displayName(learner)),
      nowIso,
    });
    if (!notice.ok) {
      return Response.json({ error: notice.error }, { status: 500 });
    }

    return Response.json({ ok: true, status: "denied" as const });
  }

  // accept
  if (offer.offer_type === "time_suggestion" && bookingId) {
    return acceptBookingReschedule({ admin, offerId, payload, bookingId, nowIso });
  }

  if (
    (offer.offer_type === "custom_offer" || offer.offer_type === "time_suggestion") &&
    isSessionOfferPayload(payload)
  ) {
    const created = await createBookingFromSessionOffer(admin, {
      offer_id: offerId,
      from_user_id: expertUserId,
      to_user_id: learnerUserId,
      payload,
    });
    if (!created.ok) {
      return Response.json({ error: created.error }, { status: created.status });
    }
    return Response.json({
      ok: true,
      status: "accepted" as const,
      bookingId: created.bookingId,
      requiresPayment: true,
    });
  }

  const { error: upOf } = await admin
    .from("offers")
    .update({ status: "accepted", updated_at: nowIso })
    .eq("offer_id", offerId);

  if (upOf) {
    return Response.json({ error: publicApiError(upOf) }, { status: 500 });
  }

  return Response.json({ ok: true, status: "accepted" as const, requiresPayment: false });
}
