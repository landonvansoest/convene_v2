import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { expertGraceEndAt } from "@/lib/freelance/transitions";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    learnerUserId: z.string().uuid(),
    descriptionOfWork: z.string().min(1).max(8000),
    totalPrice: z.number().nonnegative(),
    rate: z.number().nonnegative().optional().nullable(),
    /** ISO 8601 timestamp, e.g. "2026-06-30T17:00:00Z". Becomes work_deadline. */
    deadline: z.string().max(40).nullable().optional(),
    durationMinutes: z.number().int().positive().optional().nullable(),
    /** Bible FK requirement: tie offer to its message thread. */
    conversationId: z.string().uuid().optional().nullable(),
    originatingMessageId: z.string().uuid().optional().nullable(),
    /** If this is a revised offer after decline, link back to the previous row. */
    supersedesFreelanceId: z.string().uuid().optional().nullable(),
  })
  .strict();

/**
 * Expert creates a freelance offer for a learner.
 *
 * Status starts at `offered` per Bible. We populate `work_deadline` from
 * `deadline` and pre-compute `expert_grace_end_at` so the missed-deadline
 * cron has the data it needs immediately — no second update required.
 */
export async function POST(request: Request) {
  const expertUserId = await getAuthedUserId();
  if (!expertUserId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("expert_profiles")
    .select("expert_visibility_state")
    .eq("user_id", expertUserId)
    .maybeSingle();

  if (!profile || profile.expert_visibility_state !== "visible_active") {
    return Response.json({ error: "Active expert profile required" }, { status: 403 });
  }

  const {
    learnerUserId,
    descriptionOfWork,
    totalPrice,
    rate,
    deadline,
    durationMinutes,
    conversationId,
    originatingMessageId,
    supersedesFreelanceId,
  } = parsed.data;
  if (learnerUserId === expertUserId) {
    return Response.json({ error: "Learner must be a different user" }, { status: 400 });
  }

  const { data: learner } = await admin.from("users").select("user_id").eq("user_id", learnerUserId).maybeSingle();
  if (!learner) {
    return Response.json({ error: "Learner not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const duration =
    durationMinutes != null && durationMinutes > 0 ? `${durationMinutes} minutes` : null;

  // Normalize the deadline. We accept any parsable timestamp-ish string and
  // store it on both the legacy `deadline` column (display) and the new
  // `work_deadline` (SLA / cron). Bible §"missed work deadline" needs the
  // grace window pre-computed so we don't have to chase the row later.
  const workDeadlineIso = deadline ? normalizeIsoTimestamp(deadline) : null;
  const expertGraceEndAtIso = expertGraceEndAt(workDeadlineIso);

  const { data: row, error: insErr } = await admin
    .from("freelance_work")
    .insert({
      expert_user_id: expertUserId,
      learner_user_id: learnerUserId,
      description_of_work: descriptionOfWork,
      total_price: totalPrice,
      rate: rate ?? null,
      deadline: deadline ?? null,
      duration,
      status: "offered",
      payment_status: "pending",
      work_deadline: workDeadlineIso,
      expert_grace_end_at: expertGraceEndAtIso,
      conversation_id: conversationId ?? null,
      originating_message_id: originatingMessageId ?? null,
      supersedes_freelance_id: supersedesFreelanceId ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insErr) {
    return Response.json({ error: publicApiError(insErr) }, { status: 500 });
  }

  return Response.json({ freelance: row }, { status: 201 });
}

/** Rows where the signed-in user is expert or learner. */
export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("freelance_work")
    .select("*")
    .or(`expert_user_id.eq.${userId},learner_user_id.eq.${userId}`)
    .order("updated_at", { ascending: false });

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const items = (data ?? []).map((row) => ({
    ...row,
    user_role: row.learner_user_id === userId ? ("learner" as const) : ("expert" as const),
  }));

  return Response.json({ items });
}

function normalizeIsoTimestamp(input: string): string | null {
  const t = Date.parse(input);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}
