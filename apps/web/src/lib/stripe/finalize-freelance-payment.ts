import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { expertGraceEndAt } from "@/lib/freelance/transitions";

const TYPE = "freelance_work";

/**
 * On successful PaymentIntent with `metadata.convene_type === freelance_work`: mark freelance paid + ledger row.
 * Idempotent: one succeeded `freelance_work` transaction per `freelance_id`.
 */
export async function finalizeFreelanceFromPaymentIntent(
  admin: SupabaseClient,
  pi: Stripe.PaymentIntent
): Promise<void> {
  if ((pi.metadata?.convene_type ?? "").trim() !== TYPE) {
    return;
  }

  const freelanceId = (pi.metadata?.freelanceId ?? "").trim();
  if (!freelanceId) {
    console.info("[stripe] freelance PI: missing freelanceId; skip");
    return;
  }

  const { data: row, error: rowErr } = await admin
    .from("freelance_work")
    .select(
      "freelance_id, expert_user_id, learner_user_id, total_price, status, payment_status, work_deadline, expert_grace_end_at"
    )
    .eq("freelance_id", freelanceId)
    .maybeSingle();

  if (rowErr || !row) {
    console.error("[stripe] freelance not found for PI", freelanceId, rowErr?.message);
    return;
  }

  const metaExpert = (pi.metadata?.expertUserId ?? "").trim();
  if (metaExpert && metaExpert !== row.expert_user_id) {
    console.warn("[stripe] freelance PI expertUserId mismatch", {
      metaExpert,
      rowExpert: row.expert_user_id,
    });
  }

  const { data: existing } = await admin
    .from("transactions")
    .select("transaction_id")
    .eq("freelance_id", freelanceId)
    .eq("transaction_type", "freelance_work")
    .eq("status", "succeeded")
    .maybeSingle();

  if (existing) {
    console.info("[stripe] idempotent skip: freelance_work already recorded", freelanceId);
    return;
  }

  const amountCents = pi.amount_received ?? pi.amount;
  const feeCents =
    pi.application_fee_amount ?? Math.round(amountCents * 0.1);
  const totalCharge = amountCents / 100;
  const platformFee = feeCents / 100;
  const expertEarnings = Math.max(0, (amountCents - feeCents) / 100);
  const now = new Date().toISOString();

  // Bible §"After successful payment: status → paid_in_progress, escrow held".
  // Also stamp the Stripe PI id on the row for ledger cross-reference and
  // (re-)compute expert_grace_end_at in case the row was created before
  // migration 046 backfilled SLA columns.
  const freelanceUpdate: Record<string, unknown> = {
    payment_status: "paid",
    status: "paid_in_progress",
    stripe_payment_intent_id: pi.id,
    updated_at: now,
  };
  if (!row.expert_grace_end_at) {
    freelanceUpdate.expert_grace_end_at = expertGraceEndAt(
      row.work_deadline ? new Date(row.work_deadline).toISOString() : null,
    );
  }

  const { error: updErr } = await admin
    .from("freelance_work")
    .update(freelanceUpdate)
    .eq("freelance_id", freelanceId);

  if (updErr) {
    console.error("[stripe] freelance payment_status update failed", updErr.message);
    return;
  }

  const { error: txErr } = await admin.from("transactions").insert({
    transaction_type: "freelance_work",
    freelance_id: freelanceId,
    expert_user_id: row.expert_user_id,
    learner_user_id: row.learner_user_id,
    booking_amount: Number(row.total_price),
    extensions_amount: 0,
    platform_fee: platformFee,
    taxes_fees: 0,
    total_charge: totalCharge,
    expert_earnings: expertEarnings,
    status: "succeeded",
    payment_method: "stripe",
    transaction_date: now,
    updated_at: now,
  });

  if (txErr) {
    console.error("[stripe] freelance transaction insert failed", txErr.message);
  } else {
    console.info("[stripe] freelance payment finalized", freelanceId, pi.id);
  }
}
