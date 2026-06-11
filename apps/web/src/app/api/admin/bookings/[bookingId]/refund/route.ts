import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { publicApiError } from "@/lib/api/public-error";
import {
  resolveUserFeedback,
  sendAdminBookingDm,
} from "@/lib/admin/booking-problem-actions";
import { dispatchRefundIssuedEmail } from "@/lib/notifications/booking-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ bookingId: string }> };

const bodySchema = z.object({
  /** Partial refund in cents. Omit or null for a full refund of the remaining balance on the PaymentIntent. */
  amountCents: z.number().int().positive().optional().nullable(),
  /** After a successful Stripe refund, set refund_review_status to resolved (default true). */
  markResolved: z.boolean().optional(),
  /** Optional DM sent to the learner from the Convene team account. */
  message: z.string().trim().min(1).max(4000).optional().nullable(),
  /** If this refund resolves a user_feedback complaint, pass its feedback_id. */
  feedbackId: z.string().uuid().optional().nullable(),
});

export async function POST(request: Request, { params }: Params) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const { bookingId } = await params;
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

  const { amountCents, markResolved = true, message, feedbackId } = parsed.data;

  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: booking, error: fetchErr } = await admin
    .from("bookings")
    .select(
      "booking_id, status, session_date, stripe_payment_intent_id, refunded_amount_cents, refund_review_status, learner_user_id",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (fetchErr) return Response.json({ error: publicApiError(fetchErr) }, { status: 500 });
  if (!booking) return Response.json({ error: "Booking not found" }, { status: 404 });

  const piId = booking.stripe_payment_intent_id?.trim();
  if (!piId) {
    return Response.json(
      { error: "This booking has no Stripe payment intent (e.g. package credit). Refund in Stripe manually if needed." },
      { status: 400 },
    );
  }

  try {
    const refundParams: { payment_intent: string; amount?: number } = {
      payment_intent: piId,
    };
    if (amountCents != null) refundParams.amount = amountCents;

    const refund = await stripe.refunds.create(refundParams);

    const prev = Number(booking.refunded_amount_cents ?? 0);
    const delta = typeof refund.amount === "number" ? refund.amount : 0;
    const nextTotal = prev + delta;

    const update: Record<string, unknown> = {
      refunded_amount_cents: nextTotal,
      updated_at: new Date().toISOString(),
    };
    if (markResolved) {
      update.refund_review_status = "resolved";
    }

    const { error: upErr } = await admin.from("bookings").update(update).eq("booking_id", bookingId);
    if (upErr) {
      return Response.json(
        {
          error: publicApiError(upErr),
          warning: "Stripe refund succeeded but database update failed; reconcile refunded_amount_cents manually.",
          stripeRefundId: refund.id,
        },
        { status: 500 },
      );
    }

    if (booking.learner_user_id) {
      const { data: learner } = await admin
        .from("users")
        .select("first_name, last_name, email_address")
        .eq("user_id", booking.learner_user_id)
        .maybeSingle();
      if (learner?.email_address) {
        const learnerName =
          `${learner.first_name ?? ""} ${learner.last_name ?? ""}`.trim() ||
          learner.email_address;
        const refundAmount = `$${(delta / 100).toFixed(2)}`;
        try {
          await dispatchRefundIssuedEmail({
            recipientEmail: learner.email_address,
            recipientName: learnerName,
            sessionDate: String(booking.session_date ?? ""),
            refundAmount,
          });
        } catch (e) {
          console.error("[admin-refund] refund email failed", e);
        }
      }
    }

    let dmResult: Awaited<ReturnType<typeof sendAdminBookingDm>> | null = null;
    if (message && booking.learner_user_id) {
      dmResult = await sendAdminBookingDm({
        recipientUserId: booking.learner_user_id as string,
        message,
        bookingId,
        feedbackId: feedbackId ?? undefined,
        kind: "refund",
      });
    }

    let feedbackResolved = false;
    if (feedbackId) {
      const r = await resolveUserFeedback(feedbackId, message ?? undefined);
      feedbackResolved = r.resolved;
    }

    return Response.json({
      ok: true,
      stripeRefundId: refund.id,
      amountCentsRefunded: refund.amount,
      refundedAmountCentsTotal: nextTotal,
      refundReviewStatus: markResolved ? "resolved" : booking.refund_review_status,
      messageSent: dmResult?.sent ?? false,
      messageError: dmResult && !dmResult.sent ? dmResult.reason : null,
      feedbackResolved,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stripe refund failed";
    return Response.json({ error: msg }, { status: 502 });
  }
}
