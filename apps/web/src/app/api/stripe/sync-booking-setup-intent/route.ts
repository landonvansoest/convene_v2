import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { isAwaitingExpertBookingRequest } from "@/lib/booking-request";
import { isSessionPaymentTestBypassAllowed } from "@/lib/dev-session-payment-test";
import { getStripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  bookingId: z.string().uuid(),
  setupIntentId: z.string().min(1).optional(),
  /** Dev bypass: skip Stripe and mark PM saved. */
  devSkip: z.boolean().optional(),
});

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

  const { bookingId, setupIntentId, devSkip } = parsed.data;
  const admin = createAdminClient();

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("booking_id, learner_user_id, payment_status, stripe_payment_method_id")
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
    return Response.json({ ok: true, alreadySaved: true });
  }

  const allowBypass = await isSessionPaymentTestBypassAllowed(admin);
  if (devSkip && allowBypass) {
    const now = new Date().toISOString();
    const { error: updErr } = await admin
      .from("bookings")
      .update({
        stripe_payment_method_id: "dev_skip",
        updated_at: now,
      })
      .eq("booking_id", bookingId);
    if (updErr) {
      return Response.json({ error: publicApiError(updErr) }, { status: 500 });
    }
    return Response.json({ ok: true, dev_bypass: true });
  }

  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const siId =
    setupIntentId?.trim() ||
    String(
      (
        await admin
          .from("bookings")
          .select("stripe_setup_intent_id")
          .eq("booking_id", bookingId)
          .maybeSingle()
      ).data?.stripe_setup_intent_id ?? "",
    ).trim();

  if (!siId) {
    return Response.json({ error: "SetupIntent id required" }, { status: 400 });
  }

  const si = await stripe.setupIntents.retrieve(siId);
  if (si.metadata?.bookingId && si.metadata.bookingId !== bookingId) {
    return Response.json({ error: "SetupIntent does not match booking" }, { status: 400 });
  }
  if (si.status !== "succeeded") {
    return Response.json({ error: "Payment method setup was not completed" }, { status: 400 });
  }

  const pmId =
    typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id ?? "";
  if (!pmId) {
    return Response.json({ error: "No payment method on SetupIntent" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("bookings")
    .update({
      stripe_payment_method_id: pmId,
      stripe_setup_intent_id: si.id,
      updated_at: now,
    })
    .eq("booking_id", bookingId);

  if (updErr) {
    return Response.json({ error: publicApiError(updErr) }, { status: 500 });
  }

  return Response.json({ ok: true, paymentMethodId: pmId });
}
