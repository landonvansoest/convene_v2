import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { getStripe } from "@/lib/stripe/server";
import { publicApiError } from "@/lib/api/public-error";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InvoiceWithConfirm = Stripe.Invoice & {
  confirmation_secret?: { client_secret?: string | null; type?: string } | null;
  /** Present when invoice is expanded with `payment_intent`. */
  payment_intent?: string | Stripe.PaymentIntent | null;
};

/**
 * Open subscription invoices can expose the client secret on `confirmation_secret` (newer API) or
 * on the nested `payment_intent`. Always re-fetch the invoice with expands so we don't miss either.
 */
async function clientSecretFromInvoiceId(stripe: Stripe, invoiceId: string): Promise<string | null> {
  let inv: InvoiceWithConfirm;
  try {
    inv = (await stripe.invoices.retrieve(invoiceId, {
      expand: ["payment_intent", "confirmation_secret"],
    })) as InvoiceWithConfirm;
  } catch {
    inv = (await stripe.invoices.retrieve(invoiceId, {
      expand: ["payment_intent"],
    })) as InvoiceWithConfirm;
  }
  const fromConfirm = inv.confirmation_secret?.client_secret;
  if (typeof fromConfirm === "string" && fromConfirm) return fromConfirm;
  if (inv.payment_intent) {
    const pi = inv.payment_intent;
    if (typeof pi === "string") {
      const p = await stripe.paymentIntents.retrieve(pi);
      return p.client_secret;
    }
    return (pi as Stripe.PaymentIntent).client_secret;
  }
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.warn("[create-subscription-payment-intent] no client secret", {
      invoiceId,
      amount_due: inv.amount_due,
      status: inv.status,
    });
  }
  return null;
}

async function clientSecretFromSubscription(
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const invRef = subscription.latest_invoice;
  if (!invRef) return null;
  const invoiceId = typeof invRef === "string" ? invRef : invRef.id;
  if (!invoiceId) return null;
  return clientSecretFromInvoiceId(stripe, invoiceId);
}

/**
 * In-app subscription payment (Payment Element): create or resume an incomplete subscription and
 * return the PaymentIntent `client_secret` (same model as session booking payment).
 * Webhooks (`customer.subscription.*`) sync `user_subscriptions` as with hosted Checkout.
 */
export async function POST() {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const priceId = process.env.STRIPE_SUBSCRIPTION_PRICE_ID?.trim() || "";
  if (!priceId) {
    return Response.json(
      {
        error: "Set STRIPE_SUBSCRIPTION_PRICE_ID (recurring price id, e.g. price_...).",
      },
      { status: 503 },
    );
  }

  try {
    const createAdmin = createAdminClient();
    const { data: userRow, error: userErr } = await createAdmin
      .from("users")
      .select("email_address")
      .eq("user_id", userId)
      .maybeSingle();

    if (userErr) {
      return Response.json({ error: publicApiError(userErr) }, { status: 500 });
    }

    const supabase = await createServerSupabase();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    const customerEmail =
      (userRow?.email_address && String(userRow.email_address).trim()) || authUser?.email || undefined;

    let customerId: string | null = null;
    const { data: usSub } = await createAdmin
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .not("stripe_customer_id", "is", null)
      .limit(1)
      .maybeSingle();
    const fromDb = usSub?.stripe_customer_id?.trim();
    if (fromDb) {
      try {
        await stripe.customers.retrieve(fromDb);
        customerId = fromDb;
      } catch {
        customerId = null;
      }
    }
    if (!customerId) {
      try {
        const found = await stripe.customers.search({
          query: `metadata['user_id']:'${userId}'`,
          limit: 1,
        });
        if (found.data[0]) customerId = found.data[0].id;
      } catch {
        /* search unavailable in some setups */
      }
    }
    if (!customerId) {
      const c = await stripe.customers.create({
        email: customerEmail,
        metadata: { user_id: userId },
      });
      customerId = c.id;
    }

    const list = await stripe.subscriptions.list({
      customer: customerId,
      status: "incomplete",
      limit: 10,
    });
    const reuse = list.data.find(
      (s) => s.items.data[0]?.price?.id === priceId,
    );
    if (reuse) {
      const sub = await stripe.subscriptions.retrieve(reuse.id, {
        expand: ["latest_invoice"],
      });
      const secret = await clientSecretFromSubscription(stripe, sub);
      if (secret) {
        return Response.json({ clientSecret: secret, subscriptionId: sub.id });
      }
    }

    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      // Match /api/stripe/create-payment-intent: card-only PI by default (enable PayPal/Cash App in Stripe first).
      payment_settings: {
        save_default_payment_method: "on_subscription",
        payment_method_types: ["card"],
      },
      expand: ["latest_invoice"],
      metadata: { user_id: userId },
    });
    const secret = await clientSecretFromSubscription(stripe, sub);
    if (!secret) {
      return Response.json(
        {
          error:
            "Could not get payment client secret for this subscription. Ensure the price is a recurring amount (not $0) and the Stripe account supports invoice PaymentIntents. If this persists, check server logs in development.",
        },
        { status: 502 },
      );
    }
    return Response.json({ clientSecret: secret, subscriptionId: sub.id });
  } catch (e) {
    if (e instanceof Stripe.errors.StripeError) {
      return Response.json(
        { error: e.message, code: e.code, type: e.type },
        { status: e.statusCode && e.statusCode < 500 ? 400 : 502 },
      );
    }
    const message = e instanceof Error ? e.message : "Failed to start subscription payment";
    return Response.json({ error: message }, { status: 500 });
  }
}
