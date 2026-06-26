import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { dispatchPackagePurchased } from "@/lib/notifications/package-notifications";
import { computePackageCreditExpirationAt } from "@/lib/packages/package-credit-expiration";

const TYPE = "package_purchase";

type PackageGrantContext = {
  packageId: string;
  learnerUserId: string;
  expertUserId: string;
  /** Stripe Checkout Session id or PaymentIntent id — unique idempotency key. */
  sourceStripeId: string;
  amountCents: number;
  platformFeeCents: number;
  paymentMethod: "stripe_checkout" | "stripe";
};

function isUniqueViolation(err: { code?: string; message?: string }): boolean {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return code === "23505" || msg.includes("duplicate") || msg.includes("unique");
}

async function ensurePackagePurchaseLedgerRow(
  admin: SupabaseClient,
  ctx: PackageGrantContext,
): Promise<void> {
  const { data: existingTx } = await admin
    .from("transactions")
    .select("transaction_id")
    .eq("stripe_checkout_session_id", ctx.sourceStripeId)
    .maybeSingle();

  if (existingTx) {
    return;
  }

  const totalCharge = ctx.amountCents / 100;
  const platformFee = ctx.platformFeeCents / 100;
  const expertEarnings = Math.max(0, (ctx.amountCents - ctx.platformFeeCents) / 100);
  const nowIso = new Date().toISOString();

  const { error: txErr } = await admin.from("transactions").insert({
    transaction_type: "package_purchase",
    package_id: ctx.packageId,
    expert_user_id: ctx.expertUserId,
    learner_user_id: ctx.learnerUserId,
    booking_amount: 0,
    extensions_amount: 0,
    platform_fee: platformFee,
    taxes_fees: 0,
    total_charge: totalCharge,
    expert_earnings: expertEarnings,
    status: "succeeded",
    payment_method: ctx.paymentMethod,
    transaction_date: nowIso,
    stripe_checkout_session_id: ctx.sourceStripeId,
    updated_at: nowIso,
  });

  if (txErr) {
    console.error("[stripe] package_purchase transaction insert failed", txErr.message);
  }
}

async function grantPackagePurchaseCredits(
  admin: SupabaseClient,
  ctx: PackageGrantContext,
): Promise<void> {
  const { data: existingCredit } = await admin
    .from("learner_package_credits")
    .select("credit_id")
    .eq("source_checkout_session_id", ctx.sourceStripeId)
    .maybeSingle();

  if (existingCredit) {
    await ensurePackagePurchaseLedgerRow(admin, ctx);
    console.info("[stripe] package credits already exist for source", ctx.sourceStripeId);
    return;
  }

  const { data: pkg, error: pkgErr } = await admin
    .from("expert_packages")
    .select(
      "package_id, expert_user_id, session_count, title, status, is_published, credit_expiration_days",
    )
    .eq("package_id", ctx.packageId)
    .maybeSingle();

  if (pkgErr || !pkg) {
    console.error("[stripe] package not found for purchase", ctx.packageId, pkgErr?.message);
    return;
  }
  if (pkg.status !== "active" || !pkg.is_published) {
    console.warn("[stripe] package not publishable at grant time", ctx.packageId);
  }

  const credits = pkg.session_count;
  const now = new Date();
  const nowIso = now.toISOString();
  const expirationAt = computePackageCreditExpirationAt(pkg.credit_expiration_days, now);

  const { error: insErr } = await admin.from("learner_package_credits").insert({
    package_id: ctx.packageId,
    learner_user_id: ctx.learnerUserId,
    remaining_credits: credits,
    granted_at: nowIso,
    expiration_at: expirationAt,
    source_checkout_session_id: ctx.sourceStripeId,
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (insErr) {
    if (isUniqueViolation(insErr)) {
      await ensurePackagePurchaseLedgerRow(admin, ctx);
    }
    console.error("[stripe] grant package credits failed", insErr.message);
    return;
  }

  await ensurePackagePurchaseLedgerRow(admin, ctx);

  try {
    await dispatchPackagePurchased({
      learnerUserId: ctx.learnerUserId,
      expertUserId: pkg.expert_user_id,
      packageTitle: pkg.title ?? "Package",
      creditCount: credits,
      expirationAt,
    });
  } catch (err) {
    console.error("[stripe] package purchase notification failed", ctx.sourceStripeId, err);
  }

  console.info(
    "[stripe] granted package credits",
    ctx.sourceStripeId,
    ctx.learnerUserId,
    ctx.packageId,
    credits,
  );
}

/**
 * Grant `learner_package_credits` after paid Checkout (payment mode).
 * Idempotent on `source_checkout_session_id`; writes `transactions` idempotent on `stripe_checkout_session_id`.
 */
export async function finalizePackagePurchaseFromCheckoutSession(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== "payment") {
    return;
  }
  if (session.payment_status !== "paid") {
    console.info("[stripe] package checkout not paid yet; skip", session.id);
    return;
  }

  const meta = session.metadata ?? {};
  if ((meta.convene_type ?? "").trim() !== TYPE) {
    return;
  }

  const userId = (meta.user_id ?? "").trim();
  const packageId = (meta.package_id ?? "").trim();
  if (!userId || !packageId) {
    console.info("[stripe] package checkout missing metadata", session.id);
    return;
  }

  const { data: pkg } = await admin
    .from("expert_packages")
    .select("expert_user_id")
    .eq("package_id", packageId)
    .maybeSingle();

  if (!pkg?.expert_user_id) {
    console.error("[stripe] package expert missing for checkout", packageId);
    return;
  }

  const amountCents = session.amount_total ?? 0;
  const platformFeeCents = Math.round(amountCents * 0.1);

  await grantPackagePurchaseCredits(admin, {
    packageId,
    learnerUserId: userId,
    expertUserId: pkg.expert_user_id,
    sourceStripeId: session.id,
    amountCents,
    platformFeeCents,
    paymentMethod: "stripe_checkout",
  });
}

/**
 * Grant package credits after Payment Element checkout (`payment_intent.succeeded`).
 */
export async function finalizePackagePurchaseFromPaymentIntent(
  admin: SupabaseClient,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  if ((pi.metadata?.convene_type ?? "").trim() !== TYPE) {
    return;
  }
  if (pi.status !== "succeeded") {
    console.info("[stripe] package PI not succeeded yet; skip", pi.id);
    return;
  }

  const userId = (pi.metadata?.user_id ?? "").trim();
  const packageId = (pi.metadata?.package_id ?? "").trim();
  const expertUserId = (pi.metadata?.expert_user_id ?? "").trim();
  if (!userId || !packageId || !expertUserId) {
    console.info("[stripe] package PI missing metadata", pi.id);
    return;
  }

  const amountCents = pi.amount_received ?? pi.amount;
  const platformFeeCents =
    pi.application_fee_amount ?? Math.round(amountCents * 0.1);

  await grantPackagePurchaseCredits(admin, {
    packageId,
    learnerUserId: userId,
    expertUserId,
    sourceStripeId: pi.id,
    amountCents,
    platformFeeCents,
    paymentMethod: "stripe",
  });
}
