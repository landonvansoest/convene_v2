import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSessionPaymentTestBypassAllowed } from "@/lib/dev-session-payment-test";
import { getAuthedUserId } from "@/lib/messages/service";
import { getStripe } from "@/lib/stripe/server";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  freelanceId: z.string().uuid(),
  amount: z.number().int().positive(),
});

/**
 * Learner pays for approved freelance work (Connect destination + 10% app fee, same pattern as session PI).
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

  const { freelanceId, amount } = parsed.data;
  const admin = createAdminClient();

  const { data: row, error: rowErr } = await admin
    .from("freelance_work")
    .select(
      "freelance_id, expert_user_id, learner_user_id, total_price, status, payment_status"
    )
    .eq("freelance_id", freelanceId)
    .maybeSingle();

  if (rowErr) {
    return Response.json({ error: publicApiError(rowErr) }, { status: 500 });
  }
  if (!row) {
    return Response.json({ error: "Freelance work not found" }, { status: 404 });
  }
  if (row.learner_user_id !== learnerId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  // Bible §"freelance_work — status enum": payment is normally synchronous
  // with accept (offered → paid_in_progress via webhook), so we accept both
  // `offered` (atomic accept+pay path used by the simple flow) and
  // `accepted_pending_payment` (used when the learner explicitly accepted
  // first via PATCH `action=accept`).
  if (row.status !== "offered" && row.status !== "accepted_pending_payment") {
    return Response.json(
      { error: `Freelance must be 'offered' or 'accepted_pending_payment' before payment (current: ${row.status})` },
      { status: 400 },
    );
  }
  const ps = String(row.payment_status ?? "").toLowerCase();
  if (ps === "paid" || ps === "succeeded") {
    return Response.json({ error: "Already paid" }, { status: 400 });
  }

  const expectedCents = Math.round(Number(row.total_price) * 100);
  if (amount !== expectedCents) {
    return Response.json(
      { error: `Amount must match total price (${expectedCents} cents)` },
      { status: 400 }
    );
  }

  const expertUserId = row.expert_user_id;

  const { data: expertProfile, error: profErr } = await admin
    .from("expert_profiles")
    .select("user_id, stripe_connect_account_id")
    .eq("user_id", expertUserId)
    .maybeSingle();

  if (profErr || !expertProfile) {
    return Response.json({ error: "Expert profile not found" }, { status: 404 });
  }

  const destination = expertProfile.stripe_connect_account_id;
  const allowBypass = await isSessionPaymentTestBypassAllowed(admin);

  const metaBase = {
    convene_type: "freelance_work",
    freelanceId,
    expertUserId,
  };

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
        ...metaBase,
        dev_bypass: "true",
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
      metadata: metaBase,
    },
    { idempotencyKey: `freelance-${freelanceId}` }
  );

  return Response.json({
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
  });
}
