import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSessionPaymentTestBypassAllowed } from "@/lib/dev-session-payment-test";
import { getAuthedUserId } from "@/lib/messages/service";
import { getStripe } from "@/lib/stripe/server";
import { publicApiError } from "@/lib/api/public-error";
import { prepareExpertSessionBooking } from "@/lib/session-booking-prepare";
import { randomUUID } from "crypto";
import { publicStripePaymentSetupError } from "@/lib/stripe/stripeMessageUi";
import { ensureLearnerStripeCustomer } from "@/lib/stripe/ensure-learner-customer";

async function jsonWithOptionalPaymentTestSkip(
  admin: SupabaseClient,
  body: Record<string, unknown>,
  init?: ResponseInit,
): Promise<Response> {
  const merged = (await isSessionPaymentTestBypassAllowed(admin))
    ? { ...body, paymentTestSkipAvailable: true as const }
    : body;
  return Response.json(merged, init);
}

/**
 * Card only on the PI — Apple Pay / Google Pay still surface on the Payment Element via the card path.
 * Do not list `paypal` / `cashapp` here unless they are activated in Stripe Dashboard → Payment methods,
 * or PaymentIntent creation fails with an invalid payment method type error.
 */
const PI_SHARED: Pick<Stripe.PaymentIntentCreateParams, "currency" | "payment_method_types"> = {
  currency: "usd",
  payment_method_types: ["card"],
};

/** Persist payment method on the learner’s Stripe Customer for reuse (extensions, off-session). */
function learnerReuseParams(
  customerId: string,
): Pick<Stripe.PaymentIntentCreateParams, "customer" | "setup_future_usage"> {
  return { customer: customerId, setup_future_usage: "off_session" };
}

/**
 * Stripe rejects idempotency key reuse when PI params change (e.g. Connect vs bypass, amount).
 * Fingerprint amount + destination mode + a per-attempt nonce (client UUID or server fallback).
 */
function buildDeferredPaymentIntentIdempotencyKey(args: {
  learnerId: string;
  expertUserId: string;
  startUtcMs: number;
  durationMinutes: number;
  applyFirstSessionDiscount?: boolean;
  amountCents: number;
  stripeConnectAccountId: string | null | undefined;
  checkoutAttemptId?: string | undefined;
}): string {
  const idemDisc = args.applyFirstSessionDiscount ? "d1" : "d0";
  const acct = args.stripeConnectAccountId?.trim();
  const xfer = acct ? `xfer${acct.replace(/^acct_/, "")}` : "noxfer";
  const nonce = args.checkoutAttemptId?.trim() || randomUUID();
  return [
    "defpay",
    args.learnerId,
    args.expertUserId,
    String(args.startUtcMs),
    String(args.durationMinutes),
    idemDisc,
    String(args.amountCents),
    xfer,
    nonce,
  ].join("-");
}

export const dynamic = "force-dynamic";

const withBookingSchema = z.object({
  expertUserId: z.string().uuid(),
  bookingId: z.string().uuid(),
  /** @deprecated Ignored — amount is taken from the booking row to avoid float/client drift. */
  amount: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

const deferredSessionSchema = z.object({
  expertUserId: z.string().uuid(),
  startUtcMs: z.number(),
  durationMinutes: z.number().int().positive(),
  applyFirstSessionDiscount: z.boolean().optional(),
  /** New attempt per Book session click — avoids Stripe idempotency mismatch when checkout is retried. */
  checkoutAttemptId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

const bodySchema = z.union([withBookingSchema, deferredSessionSchema]);

function isDeferredBody(
  v: z.infer<typeof bodySchema>,
): v is z.infer<typeof deferredSessionSchema> {
  return !("bookingId" in v && v.bookingId);
}

function deferredCheckoutMetadata(
  learnerUserId: string,
  d: import("@/lib/session-booking-prepare").PreparedExpertSessionBooking,
): Record<string, string> {
  return {
    conveneSessionCheckout: "1",
    learnerUserId,
    expertUserId: d.expertUserId,
    expertProfileId: d.expertProfileId,
    sessionDate: d.sessionDate,
    startTime: d.startTime,
    endTime: d.endTime,
    durationMinutes: String(d.durationMinutes),
    rate: String(d.rateHourly),
    discountApplied: String(d.discountApplied),
    bookingAmount: String(d.pricing.booking_amount),
    platformFee: String(d.pricing.platform_fee),
    taxesFees: String(d.pricing.taxes_fees),
    totalAmount: String(d.pricing.total_amount),
  };
}

/** `numeric(12,2)` from Postgres may arrive as string; avoid binary-float cent drift. */
function bookingTotalToCents(totalAmount: unknown): number {
  if (totalAmount == null) return -1;
  const s = String(totalAmount).trim();
  const m = /^(-?)(\d+)\.(\d{2})$/.exec(s);
  if (m) {
    const sign = m[1] ? -1 : 1;
    return sign * (parseInt(m[2], 10) * 100 + parseInt(m[3], 10));
  }
  const n = Number(totalAmount);
  if (!Number.isFinite(n) || n <= 0) return -1;
  return Math.round(n * 100 + Number.EPSILON);
}

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
      { status: 503 },
    );
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
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  if (isDeferredBody(body)) {
    const prepared = await prepareExpertSessionBooking(admin, {
      learnerUserId: learnerId,
      expertUserId: body.expertUserId,
      startUtcMs: body.startUtcMs,
      durationMinutes: body.durationMinutes,
      applyFirstSessionDiscount: body.applyFirstSessionDiscount,
    });

    if (!prepared.ok) {
      return Response.json({ error: prepared.error }, { status: prepared.status });
    }
    if (!prepared.data.autoAccept) {
      return Response.json(
        { error: "This expert does not accept instant bookings; use request flow." },
        { status: 400 },
      );
    }

    const d = prepared.data;
    const amount = bookingTotalToCents(d.pricing.total_amount);
    if (amount < 1) {
      return Response.json({ error: "Invalid session total amount" }, { status: 400 });
    }

    const baseMeta = deferredCheckoutMetadata(learnerId, d);
    const meta = { ...baseMeta, ...(body.metadata ?? {}) };

    const { data: expertProfile, error } = await admin
      .from("expert_profiles")
      .select("user_id, stripe_connect_account_id")
      .eq("user_id", body.expertUserId)
      .maybeSingle();

    if (error || !expertProfile) {
      return Response.json({ error: "Expert profile not found" }, { status: 404 });
    }

    const destination = expertProfile.stripe_connect_account_id;
    const allowBypassWithoutConnect = await isSessionPaymentTestBypassAllowed(admin);

    const idempotencyKey = buildDeferredPaymentIntentIdempotencyKey({
      learnerId,
      expertUserId: body.expertUserId,
      startUtcMs: body.startUtcMs,
      durationMinutes: body.durationMinutes,
      applyFirstSessionDiscount: body.applyFirstSessionDiscount,
      amountCents: amount,
      stripeConnectAccountId: destination,
      checkoutAttemptId: body.checkoutAttemptId,
    });

    if (!destination) {
      if (!allowBypassWithoutConnect) {
        return Response.json(
          { error: "Expert payment setup not complete" },
          { status: 400 },
        );
      }

      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount,
            ...PI_SHARED,
            ...reuse,
            metadata: {
              ...meta,
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
          dev_bypass: true,
        });
      } catch (err: unknown) {
        console.error("[create-payment-intent] deferred dev bypass PI:", err);
        return Response.json({ error: publicStripePaymentSetupError(err, "session_booking") }, { status: 502 });
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
          metadata: meta,
        },
        { idempotencyKey },
      );
      if (!pi.client_secret) {
        return Response.json({ error: "Stripe did not return a client secret" }, { status: 502 });
      }
      return await jsonWithOptionalPaymentTestSkip(admin, {
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
      });
    } catch (err: unknown) {
      console.error("[create-payment-intent] deferred Connect PI:", err);
      if (process.env.NODE_ENV !== "production") {
        try {
          const pi = await stripe.paymentIntents.create(
            {
              amount,
              ...PI_SHARED,
              ...reuse,
              metadata: {
                ...meta,
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
            dev_bypass: true,
            connect_fallback: true,
          });
        } catch (fallbackErr: unknown) {
          console.error("[create-payment-intent] deferred Connect fallback PI:", fallbackErr);
          return Response.json({ error: publicStripePaymentSetupError(fallbackErr, "session_booking") }, { status: 502 });
        }
      }
      return Response.json({ error: publicStripePaymentSetupError(err, "session_booking") }, { status: 502 });
    }
  }

  const { expertUserId, bookingId, metadata } = body;

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
  if (ps === "awaiting_expert") {
    return Response.json({ error: "Waiting for expert approval." }, { status: 400 });
  }
  const amount = bookingTotalToCents(booking.total_amount);
  if (amount < 1) {
    return Response.json({ error: "Invalid booking total amount" }, { status: 400 });
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
  /** Local `next dev`: allow test PaymentIntents without Connect. Production requires Connect or explicit flags. */
  const allowBypassWithoutConnect = await isSessionPaymentTestBypassAllowed(admin);

  if (!destination) {
    if (!allowBypassWithoutConnect) {
      return Response.json(
        { error: "Expert payment setup not complete" },
        { status: 400 },
      );
    }

    try {
      const pi = await stripe.paymentIntents.create({
        amount,
        ...PI_SHARED,
        ...reuse,
        metadata: {
          expertUserId,
          bookingId,
          dev_bypass: "true",
          ...metadata,
        },
      });
      if (!pi.client_secret) {
        return Response.json({ error: "Stripe did not return a client secret" }, { status: 502 });
      }
      return await jsonWithOptionalPaymentTestSkip(admin, {
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        dev_bypass: true,
      });
    } catch (err: unknown) {
      console.error("[create-payment-intent] dev bypass PI:", err);
      return Response.json({ error: publicStripePaymentSetupError(err, "session_booking") }, { status: 502 });
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
        metadata: {
          expertUserId,
          bookingId,
          ...metadata,
        },
      },
      { idempotencyKey: `booking-${bookingId}` },
    );
    if (!pi.client_secret) {
      return Response.json({ error: "Stripe did not return a client secret" }, { status: 502 });
    }
    return await jsonWithOptionalPaymentTestSkip(admin, {
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
    });
  } catch (err: unknown) {
    console.error("[create-payment-intent] Connect PI:", err);
    /** Incomplete or invalid Connect account often throws; in local dev retry without transfer so checkout can open. */
    if (process.env.NODE_ENV !== "production") {
      try {
        const pi = await stripe.paymentIntents.create({
          amount,
          ...PI_SHARED,
          ...reuse,
          metadata: {
            expertUserId,
            bookingId,
            dev_bypass: "true",
            connect_fallback: "true",
            ...metadata,
          },
        });
        if (!pi.client_secret) {
          return Response.json({ error: "Stripe did not return a client secret" }, { status: 502 });
        }
        return await jsonWithOptionalPaymentTestSkip(admin, {
          clientSecret: pi.client_secret,
          paymentIntentId: pi.id,
          dev_bypass: true,
          connect_fallback: true,
        });
      } catch (fallbackErr: unknown) {
        console.error("[create-payment-intent] Connect fallback PI:", fallbackErr);
        return Response.json({ error: publicStripePaymentSetupError(fallbackErr, "session_booking") }, { status: 502 });
      }
    }
    return Response.json({ error: publicStripePaymentSetupError(err, "session_booking") }, { status: 502 });
  }
}
