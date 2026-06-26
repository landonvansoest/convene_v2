import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePublishedExpertPackageFromAvailability } from "@/lib/packages/sync-expert-package-from-availability";
import { computeSessionCheckoutPricing } from "@/lib/sessionCheckoutPricing";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Resolve purchasable package from expert booking preferences (`expert_availability`). */
export async function GET(_request: Request, { params }: Params) {
  const expertUserId = (await params).id;
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("expert_profiles")
    .select("user_id, expert_visibility_state")
    .eq("user_id", expertUserId)
    .maybeSingle();

  if (!profile) {
    return Response.json({ error: "Expert not found" }, { status: 404 });
  }

  const offer = await ensurePublishedExpertPackageFromAvailability(admin, expertUserId);
  if (!offer) {
    return Response.json({ offer: null });
  }

  const checkout = computeSessionCheckoutPricing(offer.pricing.packageUsd);

  return Response.json({
    offer: {
      package_id: offer.package_id,
      title: offer.title,
      session_count: offer.session_count,
      session_duration_minutes: offer.session_duration_minutes,
      price_cents: offer.price_cents,
      currency: offer.currency,
      rate_per_15_min: offer.rate_per_15_min,
      package_discount_type: offer.package_discount_type,
      package_discount_value: offer.package_discount_value,
      list_usd: offer.pricing.listUsd,
      discount_usd: offer.pricing.discountUsd,
      package_usd: offer.pricing.packageUsd,
      platform_fee_usd: checkout.platform_fee,
      taxes_fees_usd: checkout.taxes_fees,
      total_usd: checkout.total_amount,
    },
  });
}
