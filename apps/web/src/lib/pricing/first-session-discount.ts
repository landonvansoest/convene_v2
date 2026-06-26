import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPackageDurationForNotice } from "@/lib/packages/package-deal";

export type FirstSessionDiscountDisplayInput = {
  first_session_discount_enabled?: boolean | null;
  first_session_discount_type?: string | null;
  first_session_discount_value?: number | string | null;
  first_session_discount_max_session_minutes?: number | null;
  first_session_discount_effective_from?: string | null;
  first_session_discount_effective_until?: string | null;
};

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

/** True when the learner has at least one paid/succeeded booking with this expert. */
export async function learnerHasPaidSessionWithExpert(
  admin: SupabaseClient,
  expertUserId: string,
  learnerUserId: string,
): Promise<boolean> {
  const { count, error } = await admin
    .from("bookings")
    .select("booking_id", { count: "exact", head: true })
    .eq("expert_user_id", expertUserId)
    .eq("learner_user_id", learnerUserId)
    .in("payment_status", PAID);

  if (error) {
    console.warn("[first-session-discount] paid session count failed", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

function computeDiscountUsd(
  listPrice: number,
  discountType: "percent" | "fixed_amount",
  value: number,
  specificDurationConfigured: boolean,
): { discountUsd: number; chargedUsd: number } {
  if (listPrice <= 0 || value < 0) {
    return { discountUsd: 0, chargedUsd: listPrice };
  }
  if (discountType === "percent") {
    const discountUsd = Math.round(((listPrice * value) / 100) * 100) / 100;
    const chargedUsd = Math.round((listPrice - discountUsd) * 100) / 100;
    return { discountUsd, chargedUsd };
  }
  if (specificDurationConfigured) {
    const chargedUsd = Math.round(Math.max(0, value) * 100) / 100;
    const discountUsd = Math.round(Math.max(0, listPrice - chargedUsd) * 100) / 100;
    return { discountUsd, chargedUsd };
  }
  const discountUsd = Math.min(value, listPrice);
  return {
    discountUsd,
    chargedUsd: Math.round((listPrice - discountUsd) * 100) / 100,
  };
}

export type FirstSessionBookingDurationBoundsInput = {
  minBookingMinutes: number;
  maxBookingMinutes: number;
  firstSessionDiscountEnabled: boolean;
  firstSessionDiscountMaxSessionMinutes: number | null | undefined;
  learnerHasPaidSession: boolean;
  /** When true, the learner's first booking must match the consultation length exactly. */
  packageRequireAfterFirst?: boolean;
};

/**
 * When a first-session discount has a specific consultation length, that length
 * overrides the expert minimum for learners who have not yet booked (so e.g. a
 * 15 min intro can be booked even if the expert's default minimum is longer).
 * When the expert requires a package after the first session, the first booking
 * is locked to that consultation length. Otherwise maximum stays at the expert's
 * configured max so longer first sessions remain available at the normal rate.
 */
export function firstSessionBookingDurationBounds(
  input: FirstSessionBookingDurationBoundsInput,
): { minMinutes: number; maxMinutes: number } {
  const {
    minBookingMinutes,
    maxBookingMinutes,
    firstSessionDiscountEnabled,
    firstSessionDiscountMaxSessionMinutes,
    learnerHasPaidSession,
    packageRequireAfterFirst = false,
  } = input;

  if (learnerHasPaidSession) {
    return { minMinutes: minBookingMinutes, maxMinutes: maxBookingMinutes };
  }

  const consultationMinutes = firstSessionDiscountMaxSessionMinutes;
  if (
    packageRequireAfterFirst &&
    consultationMinutes != null &&
    consultationMinutes > 0
  ) {
    return { minMinutes: consultationMinutes, maxMinutes: consultationMinutes };
  }

  if (!firstSessionDiscountEnabled) {
    return { minMinutes: minBookingMinutes, maxMinutes: maxBookingMinutes };
  }

  if (consultationMinutes == null || consultationMinutes <= 0) {
    return { minMinutes: minBookingMinutes, maxMinutes: maxBookingMinutes };
  }

  return {
    minMinutes: Math.min(minBookingMinutes, consultationMinutes),
    maxMinutes: maxBookingMinutes,
  };
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
  const specificDurationConfigured = maxMin != null && maxMin > 0;
  if (specificDurationConfigured && durationMinutes !== maxMin) {
    return {
      eligible: false,
      reason: "First-session discount applies only at the configured consultation length",
    };
  }

  const { discountUsd, chargedUsd } = computeDiscountUsd(
    listPriceUsd,
    dtype,
    dval,
    specificDurationConfigured,
  );

  if (chargedUsd > 0 && chargedUsd < STRIPE_MIN_USD) {
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

/** Price label for package notice copy, e.g. "free", "$5", "$12.50". */
export function formatFirstSessionConsultationPriceLabel(input: {
  first_session_discount_type?: string | null;
  first_session_discount_value?: number | string | null;
  first_session_discount_max_session_minutes?: number | null;
  ratePer15Min?: number | null;
}): string | null {
  const type = String(input.first_session_discount_type ?? "");
  const val = Number(input.first_session_discount_value);
  if (!Number.isFinite(val) || val < 0) return null;

  if (type === "fixed_amount") {
    if (val === 0) return "free";
    const dollars = val % 1 === 0 ? val.toFixed(0) : val.toFixed(2);
    return `$${dollars}`;
  }

  if (type === "percent") {
    if (val >= 100) return "free";
    const L = input.first_session_discount_max_session_minutes;
    const rate = Number(input.ratePer15Min);
    if (L != null && L > 0 && Number.isFinite(rate) && rate > 0) {
      const list = (rate / 15) * L;
      const price = list * (1 - Math.min(100, Math.max(0, val)) / 100);
      return `$${price.toFixed(2)}`;
    }
    const pct = val % 1 === 0 ? String(val) : val.toFixed(0);
    return `${pct}% off`;
  }

  return null;
}

export function formatFirstSessionConsultationLengthLabel(
  minutes: number | null | undefined,
): string | null {
  if (minutes == null || minutes <= 0) return null;
  return formatPackageDurationForNotice(minutes);
}

/** Client/server pricing preview (no redemption or paid-session checks). */
export function previewFirstSessionDiscountPricing(input: {
  durationMinutes: number;
  listPriceUsd: number;
  discountEnabled: boolean;
  discountType?: string | null;
  discountValue?: number | string | null;
  maxSessionMinutes?: number | null;
}):
  | { eligible: true; discountUsd: number; chargedUsd: number }
  | { eligible: false } {
  if (!input.discountEnabled || input.listPriceUsd <= 0) return { eligible: false };

  const dtype =
    input.discountType === "fixed_amount"
      ? "fixed_amount"
      : input.discountType === "percent"
        ? "percent"
        : null;
  const dval = Number(input.discountValue);
  if (!dtype || !Number.isFinite(dval) || dval < 0) return { eligible: false };

  const maxMin = input.maxSessionMinutes;
  const specificDurationConfigured = maxMin != null && maxMin > 0;
  if (specificDurationConfigured && input.durationMinutes !== maxMin) {
    return { eligible: false };
  }

  const { discountUsd, chargedUsd } = computeDiscountUsd(
    input.listPriceUsd,
    dtype,
    dval,
    specificDurationConfigured,
  );

  if (chargedUsd > 0 && chargedUsd < STRIPE_MIN_USD) {
    return { eligible: false };
  }

  return { eligible: true, discountUsd, chargedUsd };
}

export async function recordFirstSessionDiscountRedemption(
  admin: SupabaseClient,
  input: {
    expertUserId: string;
    learnerUserId: string;
    bookingId: string;
    discountApplied: number;
    paymentIntentId?: string | null;
  },
): Promise<void> {
  if (input.discountApplied <= 0) return;

  const { data: av } = await admin
    .from("expert_availability")
    .select("first_session_discount_type")
    .eq("user_id", input.expertUserId)
    .maybeSingle();
  const dtype = (av?.first_session_discount_type ?? null) as "percent" | "fixed_amount" | null;
  const now = new Date().toISOString();

  const { error } = await admin.from("discount_redemptions").insert({
    expert_user_id: input.expertUserId,
    learner_user_id: input.learnerUserId,
    booking_id: input.bookingId,
    discount_type: dtype,
    discount_value_applied: input.discountApplied,
    status: "consumed",
    used_at: now,
    payment_intent_id: input.paymentIntentId ?? null,
  });

  if (error) {
    console.error("[first-session-discount] discount_redemptions insert failed", error.message);
  }
}

/** True when the expert advertises a first-session discount on public surfaces (profile, grid). */
export function isFirstSessionDiscountAdvertised(
  input: FirstSessionDiscountDisplayInput | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!input?.first_session_discount_enabled) return false;
  const from = input.first_session_discount_effective_from;
  if (from) {
    const t = new Date(String(from)).getTime();
    if (Number.isFinite(t) && nowMs < t) return false;
  }
  const until = input.first_session_discount_effective_until;
  if (until) {
    const t = new Date(String(until)).getTime();
    if (Number.isFinite(t) && nowMs > t) return false;
  }
  return true;
}

export function firstSessionDiscountBadgeLabel(
  input: FirstSessionDiscountDisplayInput | null | undefined,
): string {
  const type = String(input?.first_session_discount_type ?? "");
  const val = Number(input?.first_session_discount_value);
  if (type === "percent" && Number.isFinite(val) && val > 0) {
    const pct = val % 1 === 0 ? String(val) : val.toFixed(0);
    return `${pct}% off first session`;
  }
  if (type === "fixed_amount" && Number.isFinite(val) && val >= 0) {
    if (val === 0) return "Free first session";
    const dollars = val % 1 === 0 ? val.toFixed(0) : val.toFixed(2);
    return `$${dollars} first session`;
  }
  return "First session discount";
}
