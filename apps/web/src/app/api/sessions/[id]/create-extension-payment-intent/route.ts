import { randomUUID } from "crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSessionPaymentTestBypassAllowed } from "@/lib/dev-session-payment-test";
import { getDevToolEnabled } from "@/lib/devTools/store";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { ensureLearnerStripeCustomer } from "@/lib/stripe/ensure-learner-customer";
import { getStripe } from "@/lib/stripe/server";
import { publicStripePaymentSetupError } from "@/lib/stripe/stripeMessageUi";
import { validateSessionExtensionPurchase } from "@/lib/sessionRoomLiveTiming";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    /** One UUID per checkout open — avoids Stripe idempotency key reuse when retrying. */
    extensionAttemptId: z.string().uuid().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .optional();

const PI_SHARED: Pick<Stripe.PaymentIntentCreateParams, "currency" | "payment_method_types"> = {
  currency: "usd",
  payment_method_types: ["card"],
};

function learnerReuseParams(
  customerId: string,
): Pick<Stripe.PaymentIntentCreateParams, "customer" | "setup_future_usage"> {
  return { customer: customerId, setup_future_usage: "off_session" };
}

async function jsonWithOptionalPaymentTestSkip(
  admin: ReturnType<typeof createAdminClient>,
  body: Record<string, unknown>,
  init?: ResponseInit,
): Promise<Response> {
  const merged = (await isSessionPaymentTestBypassAllowed(admin))
    ? { ...body, paymentTestSkipAvailable: true as const }
    : body;
  return Response.json(merged, init);
}

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/sessions/[id]/create-extension-payment-intent — learner pays for one 15‑minute extension block.
 */
export async function POST(request: Request, { params }: Params) {
  const learnerId = await getAuthedUserId();
  if (!learnerId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Stripe is not configured (STRIPE_SECRET_KEY)" }, { status: 503 });
  }

  const admin = createAdminClient();
  const ensuredCust = await ensureLearnerStripeCustomer(stripe, admin, learnerId);
  if (!ensuredCust.ok) {
    return Response.json({ error: ensuredCust.error }, { status: 502 });
  }
  const reuse = learnerReuseParams(ensuredCust.customerId);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = undefined;
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const { id: bookingId } = await params;
  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select(
      "booking_id, expert_user_id, learner_user_id, session_date, start_time, end_time, status, cancelled_at, payment_status, extensions",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (bookingErr) {
    return Response.json({ error: publicApiError(bookingErr) }, { status: 500 });
  }
  if (!booking) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }

  const valid = await validateSessionExtensionPurchase(admin, booking, learnerId);
  if (!valid.ok) {
    return Response.json({ error: valid.error }, { status: valid.status });
  }

  const { pricing, priorExtensions, expertUserId, bookingId: bId, learnerUserId } = valid.data;
  const amount = Math.round(pricing.total_amount * 100 + Number.EPSILON);
  if (amount < 1) {
    return Response.json({ error: "Invalid extension total" }, { status: 400 });
  }

  const baseMeta: Record<string, string> = {
    conveneSessionExtension: "1",
    bookingId: bId,
    expertUserId,
    learnerUserId,
    priorExtensions: String(priorExtensions),
    extensionBookingAmountUsd: String(pricing.booking_amount),
    extensionPlatformFeeUsd: String(pricing.platform_fee),
    extensionTaxesFeesUsd: String(pricing.taxes_fees),
    extensionTotalUsd: String(pricing.total_amount),
    ...(body?.metadata ?? {}),
  };

  const { data: expertProfile, error: profErr } = await admin
    .from("expert_profiles")
    .select("user_id, stripe_connect_account_id")
    .eq("user_id", expertUserId)
    .maybeSingle();

  if (profErr || !expertProfile) {
    return Response.json({ error: "Expert profile not found" }, { status: 404 });
  }

  const destination = expertProfile.stripe_connect_account_id;
  const nonce = body?.extensionAttemptId?.trim() || randomUUID();
  /** Include cents so live `pricing` updates (parent poll) do not reuse the same key with a different amount — Stripe rejects that. */
  const idempotencyKey = `sess-ext-${bId}-${priorExtensions}-${amount}-${nonce}`;

  const allowBypassWithoutConnect =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_PAYMENT_BYPASS === "true" ||
    (await getDevToolEnabled(admin, "payment_bypass_session"));

  if (!destination) {
    if (!allowBypassWithoutConnect) {
      return Response.json({ error: "Expert payment setup not complete" }, { status: 400 });
    }
    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount,
          ...PI_SHARED,
          ...reuse,
          metadata: {
            ...baseMeta,
            dev_bypass: "true",
          },
        },
        { idempotencyKey },
      );
      if (!pi.client_secret) {
        return Response.json({ error: "Stripe did not return a client secret" }, { status: 502 });
      }
      return await jsonWithOptionalPaymentTestSkip(admin, {
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        pricing,
        dev_bypass: true,
      });
    } catch (err: unknown) {
      console.error("[create-extension-payment-intent] dev bypass PI:", err);
      return Response.json({ error: publicStripePaymentSetupError(err, "session_extension") }, { status: 502 });
    }
  }

  const applicationFeeAmount = Math.round(amount * 0.1);

  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount,
        ...PI_SHARED,
        ...reuse,
        application_fee_amount: applicationFeeAmount,
        transfer_data: { destination },
        metadata: baseMeta,
      },
      { idempotencyKey },
    );
    if (!pi.client_secret) {
      return Response.json({ error: "Stripe did not return a client secret" }, { status: 502 });
    }
    return await jsonWithOptionalPaymentTestSkip(admin, {
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      pricing,
    });
  } catch (err: unknown) {
    console.error("[create-extension-payment-intent] Connect PI:", err);
    if (process.env.NODE_ENV !== "production") {
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount,
            ...PI_SHARED,
            ...reuse,
            metadata: {
              ...baseMeta,
              dev_bypass: "true",
              connect_fallback: "true",
            },
          },
          { idempotencyKey: `${idempotencyKey}-fb` },
        );
        if (!pi.client_secret) {
          return Response.json({ error: "Stripe did not return a client secret" }, { status: 502 });
        }
        return await jsonWithOptionalPaymentTestSkip(admin, {
          clientSecret: pi.client_secret,
          paymentIntentId: pi.id,
          pricing,
          dev_bypass: true,
          connect_fallback: true,
        });
      } catch (fallbackErr: unknown) {
        console.error("[create-extension-payment-intent] Connect fallback PI:", fallbackErr);
        return Response.json({ error: publicStripePaymentSetupError(fallbackErr, "session_extension") }, { status: 502 });
      }
    }
    return Response.json({ error: publicStripePaymentSetupError(err, "session_extension") }, { status: 502 });
  }
}
