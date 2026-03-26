import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeFreelanceFromPaymentIntent } from "@/lib/stripe/finalize-freelance-payment";
import { finalizePackagePurchaseFromCheckoutSession } from "@/lib/stripe/finalize-package-purchase";
import { finalizeSessionBookingFromPaymentIntent } from "@/lib/stripe/finalize-session-payment";
import { getStripe } from "@/lib/stripe/server";
import { syncUserSubscriptionFromStripe } from "@/lib/stripe/sync-user-subscription";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Dedupe only these: PI handlers are intentionally re-runnable (idempotent). */
const STRIPE_WEBHOOK_DEDUPE_TYPES = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/**
 * POST /api/stripe/webhook — verify signature; finalize bookings + transactions on success.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return Response.json(
      { error: "Stripe webhook not configured" },
      { status: 503 }
    );
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return Response.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await request.text();

  let event: import("stripe").Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "verify failed";
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  const admin = createAdminClient();
  if (STRIPE_WEBHOOK_DEDUPE_TYPES.has(event.type)) {
    const { data: already } = await admin
      .from("processed_stripe_webhook_events")
      .select("event_id")
      .eq("event_id", event.id)
      .maybeSingle();
    if (already) {
      return Response.json({ received: true, duplicate: true });
    }
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object;
      console.info("[stripe] payment_intent.succeeded", pi.id);
      try {
        await finalizeSessionBookingFromPaymentIntent(admin, pi);
      } catch (e) {
        console.error("[stripe] finalize session payment failed", e);
      }
      try {
        await finalizeFreelanceFromPaymentIntent(admin, pi);
      } catch (e) {
        console.error("[stripe] finalize freelance payment failed", e);
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      console.info("[stripe] payment_intent.payment_failed", pi.id);
      const nowIso = new Date().toISOString();
      try {
        const bookingId = (pi.metadata?.bookingId ?? "").trim();
        if (bookingId) {
          await admin
            .from("bookings")
            .update({
              payment_status: "failed",
              updated_at: nowIso,
            })
            .eq("booking_id", bookingId);
        }
        const freelanceId = (pi.metadata?.freelanceId ?? "").trim();
        if (
          freelanceId &&
          (pi.metadata?.convene_type ?? "").trim() === "freelance_work"
        ) {
          await admin
            .from("freelance_work")
            .update({
              payment_status: "failed",
              updated_at: nowIso,
            })
            .eq("freelance_id", freelanceId);
        }
      } catch (e) {
        console.error("[stripe] mark payment failed on row", e);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      console.info("[stripe] subscription event", event.type, sub.id);
      try {
        await syncUserSubscriptionFromStripe(admin, sub);
        const { error: logErr } = await admin.from("processed_stripe_webhook_events").insert({
          event_id: event.id,
          event_type: event.type,
        });
        if (logErr && logErr.code !== "23505") {
          console.error("[stripe] webhook event log insert failed", logErr.message);
        }
      } catch (e) {
        console.error("[stripe] subscription sync failed", e);
      }
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object;
      try {
        await finalizePackagePurchaseFromCheckoutSession(admin, session);

        if (session.mode === "subscription") {
          const subRef = session.subscription;
          const subId = typeof subRef === "string" ? subRef : subRef?.id;
          if (subId) {
            console.info("[stripe] checkout.session.completed subscription", session.id, subId);
            const sub = await stripe.subscriptions.retrieve(subId);
            await syncUserSubscriptionFromStripe(admin, sub);
          }
        }
        const { error: logErr } = await admin.from("processed_stripe_webhook_events").insert({
          event_id: event.id,
          event_type: event.type,
        });
        if (logErr && logErr.code !== "23505") {
          console.error("[stripe] webhook event log insert failed", logErr.message);
        }
      } catch (e) {
        console.error("[stripe] checkout.session.completed handler failed", e);
      }
      break;
    }
    default:
      console.info("[stripe] unhandled", event.type);
  }

  return Response.json({ received: true });
}
