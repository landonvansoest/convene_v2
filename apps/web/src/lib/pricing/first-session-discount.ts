import type { SupabaseClient } from "@supabase/supabase-js";

export type FirstSessionDiscountEval =
  | {
      eligible: true;
      discountUsd: number;
      chargedUsd: number;
      discountType: "percent" | "fixed_amount";
      discountValueRaw: number;
    }
  | { eligible: false; reason: string };

const PAID = ["paid", "succeeded"];
const STRIPE_MIN_USD = 0.5;

function computeDiscountUsd(
  listPrice: number,
  discountType: "percent" | "fixed_amount",
  value: number
): number {
  if (listPrice <= 0 || value < 0) return 0;
  if (discountType === "percent") {
    return Math.round((listPrice * value) / 100 * 100) / 100;
  }
  return Math.min(value, listPrice);
}

/**
 * Learner’s first paid session with this expert: discount from `expert_availability` (Bible-shaped).
 */
export async function evaluateFirstSessionDiscount(
  admin: SupabaseClient,
  input: {
    expertUserId: string;
    learnerUserId: string;
    durationMinutes: number;
    listPriceUsd: number;
  }
): Promise<FirstSessionDiscountEval> {
  const { expertUserId, learnerUserId, durationMinutes, listPriceUsd } = input;

  if (listPriceUsd <= 0) {
    return { eligible: false, reason: "List price must be positive" };
  }

  const { count: paidCount, error: paidErr } = await admin
    .from("bookings")
    .select("booking_id", { count: "exact", head: true })
    .eq("expert_user_id", expertUserId)
    .eq("learner_user_id", learnerUserId)
    .in("payment_status", PAID);

  if (paidErr) {
    return { eligible: false, reason: paidErr.message };
  }
  if ((paidCount ?? 0) > 0) {
    return { eligible: false, reason: "Not your first paid session with this expert" };
  }

  const { data: redemption } = await admin
    .from("discount_redemptions")
    .select("status")
    .eq("expert_user_id", expertUserId)
    .eq("learner_user_id", learnerUserId)
    .maybeSingle();

  if (redemption?.status === "consumed") {
    return { eligible: false, reason: "First-session discount already used" };
  }

  const { data: openDisc } = await admin
    .from("bookings")
    .select("booking_id")
    .eq("expert_user_id", expertUserId)
    .eq("learner_user_id", learnerUserId)
    .eq("status", "upcoming")
    .eq("payment_status", "pending")
    .gt("discount_applied", 0)
    .limit(1)
    .maybeSingle();

  if (openDisc) {
    return {
      eligible: false,
      reason: "You already have a discounted session awaiting payment for this expert",
    };
  }

  const { data: av, error: avErr } = await admin
    .from("expert_availability")
    .select(
      "first_session_discount_enabled, first_session_discount_type, first_session_discount_value, first_session_discount_max_session_minutes, first_session_discount_effective_from, first_session_discount_effective_until"
    )
    .eq("user_id", expertUserId)
    .maybeSingle();

  if (avErr) {
    return { eligible: false, reason: avErr.message };
  }
  if (!av?.first_session_discount_enabled) {
    return { eligible: false, reason: "Expert has no first-session discount" };
  }

  const dtype = av.first_session_discount_type as "percent" | "fixed_amount" | null;
  const dval = av.first_session_discount_value != null ? Number(av.first_session_discount_value) : NaN;
  if (!dtype || !Number.isFinite(dval) || dval < 0) {
    return { eligible: false, reason: "Discount is not configured" };
  }

  const t = new Date();
  if (av.first_session_discount_effective_from) {
    const from = new Date(av.first_session_discount_effective_from).getTime();
    if (Number.isFinite(from) && t.getTime() < from) {
      return { eligible: false, reason: "Discount is not active yet" };
    }
  }
  if (av.first_session_discount_effective_until) {
    const until = new Date(av.first_session_discount_effective_until).getTime();
    if (Number.isFinite(until) && t.getTime() > until) {
      return { eligible: false, reason: "Discount has expired" };
    }
  }

  const maxMin = av.first_session_discount_max_session_minutes;
  if (maxMin != null && maxMin > 0 && durationMinutes > maxMin) {
    return {
      eligible: false,
      reason: `Session length exceeds discount maximum (${maxMin} min)`,
    };
  }

  const discountUsd = computeDiscountUsd(listPriceUsd, dtype, dval);
  const chargedUsd = Math.round((listPriceUsd - discountUsd) * 100) / 100;

  if (chargedUsd < STRIPE_MIN_USD) {
    return {
      eligible: false,
      reason: `Discounted total must be at least $${STRIPE_MIN_USD.toFixed(2)} (Stripe minimum)`,
    };
  }

  return {
    eligible: true,
    discountUsd,
    chargedUsd,
    discountType: dtype,
    discountValueRaw: dval,
  };
}
