import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

/** Signed-in learner's package credits with package titles. */
export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: credits, error } = await admin
    .from("learner_package_credits")
    .select(
      `
      credit_id,
      package_id,
      remaining_credits,
      granted_at,
      expiration_at,
      created_at,
      updated_at,
      expert_packages (
        title,
        expert_user_id,
        session_duration_minutes
      )
    `
    )
    .eq("learner_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const items = (credits ?? []).map((c) => {
    const embed = c.expert_packages as
      | { title: string; expert_user_id: string; session_duration_minutes: number }
      | { title: string; expert_user_id: string; session_duration_minutes: number }[]
      | null;
    const pkg = Array.isArray(embed) ? embed[0] : embed;
    return {
      credit_id: c.credit_id,
      package_id: c.package_id,
      remaining_credits: c.remaining_credits,
      granted_at: c.granted_at,
      expiration_at: c.expiration_at,
      created_at: c.created_at,
      updated_at: c.updated_at,
      package_title: pkg?.title ?? null,
      expert_user_id: pkg?.expert_user_id ?? null,
      session_duration_minutes: pkg?.session_duration_minutes ?? null,
    };
  });

  return Response.json({ credits: items });
}
