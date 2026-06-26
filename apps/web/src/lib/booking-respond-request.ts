import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isAwaitingExpertBookingRequest,
  isBookingRequestSubmittedToExpert,
} from "@/lib/booking-request";
import {
  dispatchBookingRequestApproved,
  dispatchBookingRequestDeclined,
} from "@/lib/notifications/booking-notifications";
import { findOrCreateConversationForPair } from "@/lib/messages/service";
import { chargeApprovedBookingRequest } from "@/lib/stripe/charge-approved-booking-request";
import { expertHasBlockingBookingOverlap } from "@/lib/session-booking-prepare";

export async function respondToExpertBookingRequest(
  admin: SupabaseClient,
  args: {
    bookingId: string;
    expertUserId: string;
    action: "approve" | "decline";
    message: string;
  },
): Promise<{ ok: true; charged?: boolean } | { ok: false; error: string; status: number }> {
  const { bookingId, expertUserId, action } = args;
  const trimmedMessage = args.message.trim();
  if (!trimmedMessage) {
    return { ok: false, error: "Message is required.", status: 400 };
  }

  const { data: booking, error: fetchErr } = await admin
    .from("bookings")
    .select(
      "booking_id, expert_user_id, learner_user_id, payment_status, status, stripe_payment_method_id, session_date, start_time, end_time",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, error: fetchErr.message, status: 500 };
  }
  if (!booking) {
    return { ok: false, error: "Booking not found", status: 404 };
  }
  if (booking.expert_user_id !== expertUserId) {
    return { ok: false, error: "Forbidden", status: 403 };
  }
  if (String(booking.status ?? "").toLowerCase() !== "upcoming") {
    return { ok: false, error: "This booking is no longer open.", status: 400 };
  }
  if (!isAwaitingExpertBookingRequest(booking.payment_status)) {
    return { ok: false, error: "This booking request was already handled.", status: 400 };
  }
  if (
    action === "approve" &&
    !isBookingRequestSubmittedToExpert(booking.payment_status, booking.stripe_payment_method_id)
  ) {
    return {
      ok: false,
      error: "The learner has not saved a payment method for this request yet.",
      status: 400,
    };
  }

  const learnerUserId = String(booking.learner_user_id ?? "");
  if (!learnerUserId) {
    return { ok: false, error: "Invalid booking", status: 400 };
  }

  let outboundMessage = trimmedMessage;
  let chargedOnApprove = false;

  if (action === "approve") {
    const overlap = await expertHasBlockingBookingOverlap(
      admin,
      expertUserId,
      String(booking.session_date ?? ""),
      String(booking.start_time ?? ""),
      String(booking.end_time ?? ""),
      bookingId,
    );
    if (overlap) {
      return {
        ok: false,
        error: "This time slot is no longer available. Decline this request and ask the learner to pick another time.",
        status: 409,
      };
    }

    const chargeResult = await chargeApprovedBookingRequest(admin, bookingId);
    if (!chargeResult.ok) {
      return { ok: false, error: chargeResult.error, status: 502 };
    }
    if (chargeResult.charged) {
      chargedOnApprove = true;
      outboundMessage += "\n\nYour session is confirmed — see Booked Sessions on your dashboard.";
    } else {
      outboundMessage +=
        "\n\nWe couldn't charge your saved card. Complete payment for this session from Booked Sessions on your dashboard.";
    }
  }

  const conversation = await findOrCreateConversationForPair(expertUserId, learnerUserId);
  const nowIso = new Date().toISOString();

  const { data: inserted, error: msgErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conversation.conversation_id,
      sender_id: expertUserId,
      message: outboundMessage,
      is_read: false,
      metadata: {
        subject: action === "approve" ? "Booking approved" : "Booking declined",
        booking_request_id: bookingId,
        booking_request_action: action,
      },
    })
    .select("created_at")
    .single();

  if (msgErr) {
    return { ok: false, error: msgErr.message, status: 500 };
  }

  await admin
    .from("conversations")
    .update({
      updated_at: nowIso,
      last_message_at: inserted?.created_at ?? nowIso,
    })
    .eq("conversation_id", conversation.conversation_id);

  if (action === "approve") {
    if (!chargedOnApprove) {
      const { error: updErr } = await admin
        .from("bookings")
        .update({
          payment_status: "pending",
          updated_at: nowIso,
        })
        .eq("booking_id", bookingId);
      if (updErr) {
        return { ok: false, error: updErr.message, status: 500 };
      }
      try {
        await dispatchBookingRequestApproved(bookingId, trimmedMessage);
      } catch (e) {
        console.error("[booking-respond-request] approval notification failed", e);
      }
    }
  } else {
    const { error: updErr } = await admin
      .from("bookings")
      .update({
        status: "cancelled",
        payment_status: "failed",
        cancelled_at: nowIso,
        cancelled_by: expertUserId,
        updated_at: nowIso,
      })
      .eq("booking_id", bookingId);
    if (updErr) {
      return { ok: false, error: updErr.message, status: 500 };
    }
    try {
      await dispatchBookingRequestDeclined(bookingId, trimmedMessage);
    } catch (e) {
      console.error("[booking-respond-request] decline notification failed", e);
    }
  }

  return { ok: true, ...(action === "approve" ? { charged: chargedOnApprove } : {}) };
}
