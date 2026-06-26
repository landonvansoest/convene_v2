import type { SupabaseClient } from "@supabase/supabase-js";
import { computePackageListBookingUsd } from "@/lib/packages/package-deal";

export type ExpertPackageDealRow = {
  package_deal_enabled: boolean;
  package_session_count: number | null;
  package_session_duration_minutes: number | null;
  package_discount_type: string | null;
  package_discount_value: number | string | null;
  package_require_purchase: boolean;
  rate: number | string | null;
};

export type ResolvedExpertPackageOffer = {
  package_id: string;
  expert_user_id: string;
  title: string;
  session_count: number;
  session_duration_minutes: number;
  price_cents: number;
  currency: string;
  package_discount_type: string | null;
  package_discount_value: number | string | null;
  rate_per_15_min: number;
  pricing: ReturnType<typeof computePackageListBookingUsd>;
};

export async function loadExpertPackageDealRow(
  admin: SupabaseClient,
  expertUserId: string,
): Promise<ExpertPackageDealRow | null> {
  const { data, error } = await admin
    .from("expert_availability")
    .select(
      "package_deal_enabled, package_session_count, package_session_duration_minutes, package_discount_type, package_discount_value, package_require_purchase, rate",
    )
    .eq("user_id", expertUserId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ExpertPackageDealRow;
}

function packageTitle(sessionCount: number, sessionDurationMinutes: number): string {
  const h = Math.floor(sessionDurationMinutes / 60);
  const m = sessionDurationMinutes % 60;
  const dur =
    h === 0
      ? `${m} min`
      : m === 0
        ? `${h} hr${h === 1 ? "" : "s"}`
        : `${h} hr${h === 1 ? "" : "s"} ${m} min`;
  return `${sessionCount} × ${dur} Session Package`;
}

/**
 * Ensures a published `expert_packages` row mirrors booking-preferences package config
 * on `expert_availability` (registration + dashboard). Idempotent upsert by expert + shape.
 */
export async function ensurePublishedExpertPackageFromAvailability(
  admin: SupabaseClient,
  expertUserId: string,
): Promise<ResolvedExpertPackageOffer | null> {
  const deal = await loadExpertPackageDealRow(admin, expertUserId);
  if (!deal?.package_deal_enabled) return null;

  const sessionCount = Number(deal.package_session_count);
  const sessionDurationMinutes = Number(deal.package_session_duration_minutes);
  const ratePer15Min = Number(deal.rate ?? 0);
  if (
    !Number.isFinite(sessionCount) ||
    sessionCount <= 0 ||
    !Number.isFinite(sessionDurationMinutes) ||
    sessionDurationMinutes <= 0 ||
    !Number.isFinite(ratePer15Min) ||
    ratePer15Min <= 0
  ) {
    return null;
  }

  const pricing = computePackageListBookingUsd({
    sessionCount,
    sessionDurationMinutes,
    ratePer15Min,
    packageDiscountType: deal.package_discount_type,
    packageDiscountValue: deal.package_discount_value,
  });

  if (pricing.packageUsd <= 0) return null;

  const priceCents = Math.round(pricing.packageUsd * 100);
  const now = new Date().toISOString();
  const title = packageTitle(sessionCount, sessionDurationMinutes);

  const { data: existing } = await admin
    .from("expert_packages")
    .select("package_id, title, currency")
    .eq("expert_user_id", expertUserId)
    .eq("session_count", sessionCount)
    .eq("session_duration_minutes", sessionDurationMinutes)
    .eq("status", "active")
    .order("display_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  let packageId: string;

  if (existing?.package_id) {
    const { data: updated, error: upErr } = await admin
      .from("expert_packages")
      .update({
        title: existing.title?.trim() ? existing.title : title,
        session_count: sessionCount,
        session_duration_minutes: sessionDurationMinutes,
        price_cents: priceCents,
        is_published: true,
        status: "active",
        updated_at: now,
      })
      .eq("package_id", existing.package_id)
      .select("package_id, title, currency")
      .single();

    if (upErr || !updated) return null;
    packageId = updated.package_id;
  } else {
    const { data: inserted, error: insErr } = await admin
      .from("expert_packages")
      .insert({
        expert_user_id: expertUserId,
        title,
        description: null,
        session_count: sessionCount,
        session_duration_minutes: sessionDurationMinutes,
        price_cents: priceCents,
        stripe_price_id: null,
        currency: "USD",
        is_published: true,
        display_order: 0,
        status: "active",
        created_at: now,
        updated_at: now,
      })
      .select("package_id, title, currency")
      .single();

    if (insErr || !inserted) return null;
    packageId = inserted.package_id;
  }

  return {
    package_id: packageId,
    expert_user_id: expertUserId,
    title,
    session_count: sessionCount,
    session_duration_minutes: sessionDurationMinutes,
    price_cents: priceCents,
    currency: "USD",
    package_discount_type: deal.package_discount_type,
    package_discount_value: deal.package_discount_value,
    rate_per_15_min: ratePer15Min,
    pricing,
  };
}
