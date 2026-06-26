import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({ is_active: z.boolean() }).strict();

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const userId = await getAuthedUserId();

  const admin = createAdminClient();
  const { data: row, error } = await admin.from("requests").select("*").eq("request_id", id).maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = userId === row.user_id;
  if (!row.is_public && !isOwner) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return Response.json({ request: row });
}

/** Owner: toggle `is_active` (archive / restore). */
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
    .from("requests")
    .select("request_id, user_id")
    .eq("request_id", id)
    .maybeSingle();

  if (fetchErr) {
    return Response.json({ error: publicApiError(fetchErr) }, { status: 500 });
  }
  if (!row || row.user_id !== userId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await admin
    .from("requests")
    .update({ is_active: parsed.data.is_active, updated_at: now })
    .eq("request_id", id)
    .select("*")
    .single();

  if (upErr) {
    return Response.json({ error: publicApiError(upErr) }, { status: 500 });
  }

  return Response.json({ request: updated });
}
