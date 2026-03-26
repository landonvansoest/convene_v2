import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { getStripe } from "@/lib/stripe/server";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  amount: z.number().int().positive(),
  expertUserId: z.string().uuid(),
  bookingId: z.string().uuid(),
  metadata: z.record(z.string(), z.string()).optional(),
});

/**
 * Port of Express POST /api/stripe/create-payment-intent (v2 column names).
 * Amount is in cents (same as legacy client).
 */
export async function POST(request: Request) {
  const learnerId = await getAuthedUserId();
  if (!learnerId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return Response.json(
      { error: "Stripe is not configured (STRIPE_SECRET_KEY)" },
      { status: 503 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { amount, expertUserId, bookingId, metadata } = parsed.data;

  const admin = createAdminClient();

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("booking_id, learner_user_id, expert_user_id, total_amount, payment_status")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (bookingErr) {
    return Response.json({ error: publicApiError(bookingErr) }, { status: 500 });
  }
  if (!booking) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.learner_user_id !== learnerId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (booking.expert_user_id !== expertUserId) {
    return Response.json({ error: "expertUserId does not match booking" }, { status: 400 });
  }
  const ps = String(booking.payment_status ?? "").toLowerCase();
  if (ps === "paid" || ps === "succeeded") {
    return Response.json({ error: "Booking already paid" }, { status: 400 });
  }
  const expectedCents = Math.round(Number(booking.total_amount) * 100);
  if (amount !== expectedCents) {
    return Response.json(
      { error: `Amount must match booking total (${expectedCents} cents)` },
      { status: 400 }
    );
  }

  const { data: expertProfile, error } = await admin
    .from("expert_profiles")
    .select("user_id, stripe_connect_account_id")
    .eq("user_id", expertUserId)
    .maybeSingle();

  if (error || !expertProfile) {
    return Response.json({ error: "Expert profile not found" }, { status: 404 });
  }

  const destination = expertProfile.stripe_connect_account_id;
  const allowBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_PAYMENT_BYPASS === "true";

  if (!destination) {
    if (!allowBypass) {
      return Response.json(
        { error: "Expert payment setup not complete" },
        { status: 400 }
      );
    }

    const pi = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      metadata: {
        expertUserId,
        bookingId,
        dev_bypass: "true",
        ...metadata,
      },
    });

    return Response.json({
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      dev_bypass: true,
    });
  }

  const applicationFeeAmount = Math.round(amount * 0.1);

  const pi = await stripe.paymentIntents.create(
    {
      amount,
      currency: "usd",
      application_fee_amount: applicationFeeAmount,
      transfer_data: { destination },
      metadata: {
        expertUserId,
        bookingId,
        ...metadata,
      },
    },
    { idempotencyKey: `booking-${bookingId}` }
  );

  return Response.json({
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
  });
}
