import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { finalizePackagePurchaseFromPaymentIntent } from "@/lib/stripe/finalize-package-purchase";
import { finalizeSessionBookingFromPaymentIntent } from "@/lib/stripe/finalize-session-payment";
import { finalizeSessionExtensionFromPaymentIntent } from "@/lib/stripe/finalize-session-extension-payment";
import { getStripe } from "@/lib/stripe/server";
import {
  formatPaymentConfirmationNumber,
  lookupConfirmationNumberForPaymentIntent,
} from "@/lib/payments/confirmation-number";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  paymentIntentId: z.string().min(1),
});

/**
 * Idempotent: runs the same DB finalization as `payment_intent.succeeded` webhook.
 * Use when webhooks are not wired (e.g. local dev) so the dashboard shows Paid / Join after checkout.
 */
export async function POST(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
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

  const { paymentIntentId } = parsed.data;

  let pi: import("stripe").Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return Response.json({ error: "Could not retrieve payment" }, { status: 400 });
  }

  if (pi.status !== "succeeded") {
    return Response.json({ error: "Payment is not completed" }, { status: 400 });
  }

  const admin = createAdminClient();
  const packagePurchase = (pi.metadata?.convene_type ?? "").trim() === "package_purchase";
  const bookingId = String(pi.metadata?.bookingId ?? "").trim();
  const deferred = String(pi.metadata?.conveneSessionCheckout ?? "").trim() === "1";
  const sessionExtension = String(pi.metadata?.conveneSessionExtension ?? "").trim() === "1";

  if (packagePurchase) {
    const metaUser = String(pi.metadata?.user_id ?? "").trim();
    if (!metaUser || metaUser !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    try {
      await finalizePackagePurchaseFromPaymentIntent(admin, pi);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Finalize failed";
      console.error("[sync-session-payment-intent] package", e);
      return Response.json({ error: msg }, { status: 500 });
    }
    const confirmationRaw = await lookupConfirmationNumberForPaymentIntent(admin, pi);
    return Response.json({
      ok: true,
      confirmationNumber: confirmationRaw
        ? formatPaymentConfirmationNumber(confirmationRaw)
        : null,
    });
  }

  if (deferred) {
    const metaLearner = String(pi.metadata?.learnerUserId ?? "").trim();
    if (!metaLearner || metaLearner !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (sessionExtension && bookingId) {
    const { data: booking, error: bErr } = await admin
      .from("bookings")
      .select("learner_user_id")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (bErr) {
      return Response.json({ error: bErr.message }, { status: 500 });
    }
    if (!booking) {
      return Response.json({ error: "Booking not found" }, { status: 404 });
    }
    if (booking.learner_user_id !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (bookingId) {
    const { data: booking, error: bErr } = await admin
      .from("bookings")
      .select("learner_user_id")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (bErr) {
      return Response.json({ error: bErr.message }, { status: 500 });
    }
    if (!booking) {
      return Response.json({ error: "Booking not found" }, { status: 404 });
    }
    if (booking.learner_user_id !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    return Response.json({ error: "Not a Convene session payment" }, { status: 400 });
  }

  try {
    if (sessionExtension) {
      await finalizeSessionExtensionFromPaymentIntent(admin, pi);
    } else {
      await finalizeSessionBookingFromPaymentIntent(admin, pi, { stripe });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Finalize failed";
    console.error("[sync-session-payment-intent]", e);
    return Response.json({ error: msg }, { status: 500 });
  }

  const confirmationRaw = await lookupConfirmationNumberForPaymentIntent(admin, pi);
  return Response.json({
    ok: true,
    confirmationNumber: confirmationRaw ? formatPaymentConfirmationNumber(confirmationRaw) : null,
  });
}
