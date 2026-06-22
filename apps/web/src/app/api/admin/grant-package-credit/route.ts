import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { computePackageCreditExpirationAt } from "@/lib/packages/package-credit-expiration";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  learnerUserId: z.string().uuid(),
  packageId: z.string().uuid(),
  remainingCredits: z.number().int().positive().optional(),
});

/**
 * Manually grant package credits (admin only). Does not touch Stripe.
 */
export async function POST(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const { learnerUserId, packageId, remainingCredits } = parsed.data;
  const admin = createAdminClient();

  const { data: pkg, error: pkgErr } = await admin
    .from("expert_packages")
    .select("package_id, session_count, credit_expiration_days, expert_user_id")
    .eq("package_id", packageId)
    .maybeSingle();

  if (pkgErr || !pkg) {
    return Response.json({ error: "Package not found" }, { status: 404 });
  }

  const { data: learner } = await admin.from("users").select("user_id").eq("user_id", learnerUserId).maybeSingle();
  if (!learner) {
    return Response.json({ error: "Learner not found" }, { status: 404 });
  }

  const credits = remainingCredits ?? pkg.session_count;
  const now = new Date();
  const nowIso = now.toISOString();
  const expirationAt = computePackageCreditExpirationAt(pkg.credit_expiration_days, now);

  const { data: row, error: insErr } = await admin
    .from("learner_package_credits")
    .insert({
      package_id: packageId,
      learner_user_id: learnerUserId,
      remaining_credits: credits,
      granted_at: nowIso,
      expiration_at: expirationAt,
      source_checkout_session_id: null,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("*")
    .single();

  if (insErr) {
    return Response.json({ error: publicApiError(insErr) }, { status: 500 });
  }

  const { error: txErr } = await admin.from("transactions").insert({
    transaction_type: "adjustment",
    package_id: packageId,
    expert_user_id: pkg.expert_user_id,
    learner_user_id: learnerUserId,
    booking_amount: 0,
    extensions_amount: 0,
    platform_fee: 0,
    taxes_fees: 0,
    total_charge: 0,
    expert_earnings: 0,
    status: "succeeded",
    payment_method: "admin_grant_package_credit",
    transaction_date: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (txErr) {
    return Response.json(
      {
        error: publicApiError(txErr),
        credit: row,
        warning: "Credits were created but ledger insert failed; fix or delete the credit row and retry.",
      },
      { status: 500 }
    );
  }

  return Response.json({ credit: row }, { status: 201 });
}
