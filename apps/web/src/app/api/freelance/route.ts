import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    learnerUserId: z.string().uuid(),
    descriptionOfWork: z.string().min(1).max(8000),
    totalPrice: z.number().nonnegative(),
    rate: z.number().nonnegative().optional().nullable(),
    deadline: z.string().max(40).nullable().optional(),
    durationMinutes: z.number().int().positive().optional().nullable(),
  })
  .strict();

/** Expert creates a freelance offer for a learner (`status` = offered). */
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
    .select("expert_status")
    .eq("user_id", expertUserId)
    .maybeSingle();

  if (!profile || profile.expert_status !== "active") {
    return Response.json({ error: "Active expert profile required" }, { status: 403 });
  }

  const { learnerUserId, descriptionOfWork, totalPrice, rate, deadline, durationMinutes } = parsed.data;
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
