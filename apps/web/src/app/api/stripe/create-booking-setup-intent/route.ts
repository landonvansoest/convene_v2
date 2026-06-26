import { z } from "zod";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { isAwaitingExpertBookingRequest } from "@/lib/booking-request";
import { isSessionPaymentTestBypassAllowed } from "@/lib/dev-session-payment-test";
import { ensureLearnerStripeCustomer } from "@/lib/stripe/ensure-learner-customer";
import { getStripe } from "@/lib/stripe/server";
import { publicStripePaymentSetupError } from "@/lib/stripe/stripeMessageUi";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  bookingId: z.string().uuid(),
});

const SETUP_SHARED: Pick<Stripe.SetupIntentCreateParams, "payment_method_types"> = {
  payment_method_types: ["card"],
};

export async function POST(request: Request) {
  const learnerId = await getAuthedUserId();
  if (!learnerId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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

  const { bookingId } = parsed.data;
  const admin = createAdminClient();

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("booking_id, learner_user_id, expert_user_id, payment_status, stripe_payment_method_id")
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
  if (!isAwaitingExpertBookingRequest(booking.payment_status)) {
    return Response.json({ error: "This booking is not awaiting expert approval" }, { status: 400 });
  }
  if (String(booking.stripe_payment_method_id ?? "").trim()) {
    return Response.json({ error: "Payment method already saved for this request" }, { status: 400 });
  }

  const allowBypass = await isSessionPaymentTestBypassAllowed(admin);
  if (allowBypass && !getStripe()) {
    return Response.json({
      dev_bypass: true,
      paymentTestSkipAvailable: true,
    });
  }

  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const customerResult = await ensureLearnerStripeCustomer(stripe, admin, learnerId);
  if (!customerResult.ok) {
    return Response.json({ error: customerResult.error }, { status: 400 });
  }

  try {
    const si = await stripe.setupIntents.create(
      {
        customer: customerResult.customerId,
        ...SETUP_SHARED,
        usage: "off_session",
        metadata: {
          bookingId,
          expertUserId: String(booking.expert_user_id),
          conveneBookingRequestSetup: "1",
        },
      },
      { idempotencyKey: `booking-setup-${bookingId}` },
    );

    if (!si.client_secret) {
      return Response.json({ error: "Stripe did not return a client secret" }, { status: 502 });
    }

    await admin
      .from("bookings")
      .update({
        stripe_setup_intent_id: si.id,
        updated_at: new Date().toISOString(),
      })
      .eq("booking_id", bookingId);

    return Response.json({
      clientSecret: si.client_secret,
      setupIntentId: si.id,
      paymentTestSkipAvailable: allowBypass,
    });
  } catch (err: unknown) {
    console.error("[create-booking-setup-intent]", err);
    return Response.json(
      { error: publicStripePaymentSetupError(err, "session_booking") },
      { status: 502 },
    );
  }
}
