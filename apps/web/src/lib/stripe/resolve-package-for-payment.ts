import type { SupabaseClient } from "@supabase/supabase-js";
import { ensurePublishedExpertPackageFromAvailability } from "@/lib/packages/sync-expert-package-from-availability";
import { computeSessionCheckoutPricing } from "@/lib/sessionCheckoutPricing";

export type ResolvedPackagePayment = {
  packageId: string;
  expertUserId: string;
  title: string;
  packageBaseUsd: number;
  totalCents: number;
  checkoutPricing: ReturnType<typeof computeSessionCheckoutPricing>;
};

export async function resolvePackageForPayment(
  admin: SupabaseClient,
  input: { packageId?: string; expertUserId?: string },
): Promise<
  | { ok: true; data: ResolvedPackagePayment }
  | { ok: false; error: string; status: number }
> {
  let packageId = input.packageId?.trim() ?? "";
  const expertUserId = input.expertUserId?.trim() ?? "";

  if (!packageId && expertUserId) {
    const offer = await ensurePublishedExpertPackageFromAvailability(admin, expertUserId);
    if (!offer) {
      return { ok: false, error: "Expert has no purchasable package configured", status: 404 };
    }
    packageId = offer.package_id;
  }

  if (!packageId) {
    return { ok: false, error: "packageId or expertUserId is required", status: 400 };
  }

  const { data: pkg, error: pkgErr } = await admin
    .from("expert_packages")
    .select(
      "package_id, title, price_cents, stripe_price_id, currency, status, is_published, expert_user_id",
    )
    .eq("package_id", packageId)
    .maybeSingle();

  if (pkgErr) {
    return { ok: false, error: pkgErr.message, status: 500 };
  }
  if (!pkg || pkg.status !== "active" || !pkg.is_published) {
    return { ok: false, error: "Package not available", status: 404 };
  }

  const refreshedOffer = await ensurePublishedExpertPackageFromAvailability(admin, pkg.expert_user_id);
  const packageBaseUsd =
    refreshedOffer?.package_id === packageId
      ? refreshedOffer.pricing.packageUsd
      : Number(pkg.price_cents ?? 0) / 100;

  if (!Number.isFinite(packageBaseUsd) || packageBaseUsd <= 0) {
    return { ok: false, error: "Package has no price configured", status: 400 };
  }

  const checkoutPricing = computeSessionCheckoutPricing(packageBaseUsd);
  const totalCents = Math.round(checkoutPricing.total_amount * 100);

  return {
    ok: true,
    data: {
      packageId,
      expertUserId: pkg.expert_user_id,
      title: pkg.title ?? "Package",
      packageBaseUsd,
      totalCents,
      checkoutPricing,
    },
  };
}
