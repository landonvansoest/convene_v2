import { z } from "zod";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSessionPaymentTestBypassAllowed } from "@/lib/dev-session-payment-test";
import { getAuthedUserId } from "@/lib/messages/service";
import { resolvePackageForPayment } from "@/lib/stripe/resolve-package-for-payment";
import { getStripe } from "@/lib/stripe/server";
import { publicStripePaymentSetupError } from "@/lib/stripe/stripeMessageUi";
import { ensureLearnerStripeCustomer } from "@/lib/stripe/ensure-learner-customer";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PI_SHARED: Pick<Stripe.PaymentIntentCreateParams, "currency" | "payment_method_types"> = {
  currency: "usd",
  payment_method_types: ["card"],
};

function learnerReuseParams(
  customerId: string,
): Pick<Stripe.PaymentIntentCreateParams, "customer" | "setup_future_usage"> {
  return { customer: customerId, setup_future_usage: "off_session" };
}

const bodySchema = z
  .object({
    packageId: z.string().uuid().optional(),
    expertUserId: z.string().uuid().optional(),
    checkoutAttemptId: z.string().uuid().optional(),
  })
  .refine((d) => Boolean(d.packageId?.trim() || d.expertUserId?.trim()), {
    message: "packageId or expertUserId is required",
  });

/**
 * Payment Element checkout for expert packages (grants credits via webhook / sync on `payment_intent.succeeded`).
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
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const resolved = await resolvePackageForPayment(admin, parsed.data);
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: resolved.status });
  }

  const { packageId, expertUserId, totalCents, checkoutPricing } = resolved.data;
  if (totalCents < 1) {
    return Response.json({ error: "Invalid package total amount" }, { status: 400 });
  }

  const ensuredCust = await ensureLearnerStripeCustomer(stripe, admin, userId);
  if (!ensuredCust.ok) {
    return Response.json({ error: ensuredCust.error }, { status: 502 });
  }
  const reuse = learnerReuseParams(ensuredCust.customerId);

  const { data: expertProfile, error: expertErr } = await admin
    .from("expert_profiles")
    .select("user_id, stripe_connect_account_id")
    .eq("user_id", expertUserId)
    .maybeSingle();

  if (expertErr || !expertProfile) {
    return Response.json({ error: "Expert profile not found" }, { status: 404 });
  }

  const destination = expertProfile.stripe_connect_account_id;
  const allowBypassWithoutConnect = await isSessionPaymentTestBypassAllowed(admin);
  const checkoutAttemptId = parsed.data.checkoutAttemptId?.trim() || randomUUID();
  const idempotencyKey = `pkgpay-${userId}-${packageId}-${checkoutAttemptId}`;

  const metadata: Record<string, string> = {
    convene_type: "package_purchase",
    user_id: userId,
    package_id: packageId,
    expert_user_id: expertUserId,
    bookingAmount: String(checkoutPricing.booking_amount),
    platformFee: String(checkoutPricing.platform_fee),
    taxesFees: String(checkoutPricing.taxes_fees),
    totalAmount: String(checkoutPricing.total_amount),
  };

  if (!destination) {
    if (!allowBypassWithoutConnect) {
      return Response.json({ error: "Expert payment setup not complete" }, { status: 400 });
    }

    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: totalCents,
          ...PI_SHARED,
          ...reuse,
          metadata: { ...metadata, dev_bypass: "true" },
        },
        { idempotencyKey },
      );
      if (!pi.client_secret) {
        return Response.json({ error: "Stripe did not return a client secret" }, { status: 502 });
      }
      return Response.json({ clientSecret: pi.client_secret, paymentIntentId: pi.id, dev_bypass: true });
    } catch (err: unknown) {
      console.error("[create-package-payment-intent] dev bypass PI:", err);
      return Response.json(
        { error: publicStripePaymentSetupError(err, "session_booking") },
        { status: 502 },
      );
    }
  }

  const applicationFeeAmount = Math.round(totalCents * 0.1);

  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: totalCents,
        ...PI_SHARED,
        ...reuse,
        application_fee_amount: applicationFeeAmount,
        transfer_data: { destination },
        metadata,
      },
      { idempotencyKey },
    );
    if (!pi.client_secret) {
      return Response.json({ error: "Stripe did not return a client secret" }, { status: 502 });
    }
    return Response.json({ clientSecret: pi.client_secret, paymentIntentId: pi.id });
  } catch (err: unknown) {
    console.error("[create-package-payment-intent] Connect PI:", err);
    if (process.env.NODE_ENV !== "production") {
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount: totalCents,
            ...PI_SHARED,
            ...reuse,
            metadata: { ...metadata, dev_bypass: "true", connect_fallback: "true" },
          },
          { idempotencyKey: `${idempotencyKey}-fb` },
        );
        if (!pi.client_secret) {
          return Response.json({ error: "Stripe did not return a client secret" }, { status: 502 });
        }
        return Response.json({
          clientSecret: pi.client_secret,
          paymentIntentId: pi.id,
          dev_bypass: true,
          connect_fallback: true,
        });
      } catch (fallbackErr: unknown) {
        console.error("[create-package-payment-intent] Connect fallback PI:", fallbackErr);
        return Response.json(
          { error: publicStripePaymentSetupError(fallbackErr, "session_booking") },
          { status: 502 },
        );
      }
    }
    return Response.json({ error: publicStripePaymentSetupError(err, "session_booking") }, { status: 502 });
  }
}
