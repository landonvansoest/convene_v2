import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Published, active packages for an expert (directory / booking upsell). */
export async function GET(_request: Request, { params }: Params) {
  const { id: expertUserId } = await params;
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("expert_profiles")
    .select("user_id, expert_visibility_state")
    .eq("user_id", expertUserId)
    .maybeSingle();

  if (!profile || profile.expert_visibility_state !== "visible_active") {
    return Response.json({ packages: [] });
  }

  const { data, error } = await admin
    .from("expert_packages")
    .select(
      "package_id, title, description, session_count, session_duration_minutes, price_cents, stripe_price_id, currency, credit_expiration_days, display_order, created_at"
    )
    .eq("expert_user_id", expertUserId)
    .eq("status", "active")
    .eq("is_published", true)
    .order("display_order", { ascending: true });

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ packages: data ?? [] });
}
