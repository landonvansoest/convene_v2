import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { dispatchPackagePurchased } from "@/lib/notifications/package-notifications";
import { computePackageCreditExpirationAt } from "@/lib/packages/package-credit-expiration";

const TYPE = "package_purchase";

async function ensurePackagePurchaseLedgerRow(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
  ctx: { packageId: string; learnerUserId: string; expertUserId: string }
): Promise<void> {
  const { data: existingTx } = await admin
    .from("transactions")
    .select("transaction_id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  if (existingTx) {
    return;
  }

  const amountCents = session.amount_total ?? 0;
  const feeCents = Math.round(amountCents * 0.1);
  const totalCharge = amountCents / 100;
  const platformFee = feeCents / 100;
  const expertEarnings = Math.max(0, (amountCents - feeCents) / 100);
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
    payment_method: "stripe_checkout",
    transaction_date: nowIso,
    stripe_checkout_session_id: session.id,
    updated_at: nowIso,
  });

  if (txErr) {
    console.error("[stripe] package_purchase transaction insert failed", txErr.message);
  }
}

function isUniqueViolation(err: { code?: string; message?: string }): boolean {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return code === "23505" || msg.includes("duplicate") || msg.includes("unique");
}

/**
 * Grant `learner_package_credits` after paid Checkout (payment mode).
 * Idempotent on `source_checkout_session_id`; writes `transactions` (package_purchase) idempotent on `stripe_checkout_session_id` (migration 008).
 */
export async function finalizePackagePurchaseFromCheckoutSession(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session
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

  const { data: existingCredit } = await admin
    .from("learner_package_credits")
    .select("credit_id")
    .eq("source_checkout_session_id", session.id)
    .maybeSingle();

  if (existingCredit) {
    const { data: pkg } = await admin
      .from("expert_packages")
      .select("expert_user_id")
      .eq("package_id", packageId)
      .maybeSingle();
    if (pkg?.expert_user_id) {
      await ensurePackagePurchaseLedgerRow(admin, session, {
        packageId,
        learnerUserId: userId,
        expertUserId: pkg.expert_user_id,
      });
    }
    console.info("[stripe] package credits already exist for session", session.id);
    return;
  }

  const { data: pkg, error: pkgErr } = await admin
    .from("expert_packages")
    .select(
      "package_id, expert_user_id, session_count, title, status, is_published, credit_expiration_days"
    )
    .eq("package_id", packageId)
    .maybeSingle();

  if (pkgErr || !pkg) {
    console.error("[stripe] package not found for checkout", packageId, pkgErr?.message);
    return;
  }
  if (pkg.status !== "active" || !pkg.is_published) {
    console.warn("[stripe] package not publishable at grant time", packageId);
  }

  const credits = pkg.session_count;
  const now = new Date();
  const nowIso = now.toISOString();
  const expirationAt = computePackageCreditExpirationAt(pkg.credit_expiration_days, now);

  const { error: insErr } = await admin.from("learner_package_credits").insert({
    package_id: packageId,
    learner_user_id: userId,
    remaining_credits: credits,
    granted_at: nowIso,
    expiration_at: expirationAt,
    source_checkout_session_id: session.id,
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (insErr) {
    if (isUniqueViolation(insErr)) {
      await ensurePackagePurchaseLedgerRow(admin, session, {
        packageId,
        learnerUserId: userId,
        expertUserId: pkg.expert_user_id,
      });
    }
    console.error("[stripe] grant package credits failed", insErr.message);
    return;
  }

  await ensurePackagePurchaseLedgerRow(admin, session, {
    packageId,
    learnerUserId: userId,
    expertUserId: pkg.expert_user_id,
  });

  try {
    await dispatchPackagePurchased({
      learnerUserId: userId,
      expertUserId: pkg.expert_user_id,
      packageTitle: pkg.title ?? "Package",
      creditCount: credits,
      expirationAt,
    });
  } catch (err) {
    console.error("[stripe] package purchase notification failed", session.id, err);
  }

  console.info("[stripe] granted package credits", session.id, userId, packageId, credits);
}
