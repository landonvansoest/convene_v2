import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

/**
 * Admin queue of freelance_work rows currently in `admin_review` (per Bible
 * §"Special bookings — lifecycle"). The admin resolves them via
 * POST /api/admin/freelance-review/[id]/resolve.
 */
export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("freelance_work")
    .select(
      "freelance_id, expert_user_id, learner_user_id, total_price, work_deadline, expert_grace_end_at, completion_submitted_at, learner_completion_deadline_at, admin_review_at, admin_review_reason, rectification_deadline_at, payment_status, completion_message, completion_attachments, refunded_amount_cents, stripe_payment_intent_id, created_at, updated_at",
    )
    .eq("status", "admin_review")
    .order("admin_review_at", { ascending: true })
    .limit(200);
  if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });

  // Hydrate participant names so the admin doesn't have to chase IDs.
  const ids = new Set<string>();
  for (const r of data ?? []) {
    if (r.expert_user_id) ids.add(String(r.expert_user_id));
    if (r.learner_user_id) ids.add(String(r.learner_user_id));
  }
  let usersById = new Map<string, { user_id: string; first_name: string | null; last_name: string | null; email_address: string | null }>();
  if (ids.size > 0) {
    const { data: u } = await admin
      .from("users")
      .select("user_id, first_name, last_name, email_address")
      .in("user_id", Array.from(ids));
    usersById = new Map((u ?? []).map((x) => [String(x.user_id), x]));
  }

  const items = (data ?? []).map((r) => ({
    ...r,
    expert: usersById.get(String(r.expert_user_id)) ?? null,
    learner: usersById.get(String(r.learner_user_id)) ?? null,
  }));

  return Response.json({ items });
}
