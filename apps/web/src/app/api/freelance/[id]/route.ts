import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["approved", "complete"]),
});

export async function GET(_request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const { data: row, error } = await admin.from("freelance_work").select("*").eq("freelance_id", id).maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (row.expert_user_id !== userId && row.learner_user_id !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return Response.json({
    freelance: {
      ...row,
      user_role: row.learner_user_id === userId ? ("learner" as const) : ("expert" as const),
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error: fetchErr } = await admin
    .from("freelance_work")
    .select("*")
    .eq("freelance_id", id)
    .maybeSingle();

  if (fetchErr) {
    return Response.json({ error: publicApiError(fetchErr) }, { status: 500 });
  }
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const next = parsed.data.status;
  if (next === "approved") {
    if (row.learner_user_id !== userId) {
      return Response.json({ error: "Only the learner can approve" }, { status: 403 });
    }
    if (row.status !== "offered") {
      return Response.json({ error: "Can only approve from offered" }, { status: 400 });
    }
  }
  if (next === "complete") {
    if (row.expert_user_id !== userId) {
      return Response.json({ error: "Only the expert can mark complete" }, { status: 403 });
    }
    if (row.status !== "approved") {
      return Response.json({ error: "Can only complete from approved" }, { status: 400 });
    }
    const owed = Number(row.total_price);
    if (owed > 0) {
      const ps = String(row.payment_status ?? "").toLowerCase();
      if (ps !== "paid" && ps !== "succeeded") {
        return Response.json(
          { error: "Learner must pay before this work can be marked complete" },
          { status: 400 }
        );
      }
    }
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from("freelance_work")
    .update({ status: next, updated_at: now })
    .eq("freelance_id", id)
    .select("*")
    .single();

  if (updErr) {
    return Response.json({ error: publicApiError(updErr) }, { status: 500 });
  }

  return Response.json({ freelance: updated });
}
