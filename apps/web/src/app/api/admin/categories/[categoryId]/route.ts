import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ categoryId: string }> };

const patchSchema = z
  .object({
    name: z.string().min(1).max(200).trim().optional(),
    icon: z.string().max(80).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export async function PATCH(request: Request, { params }: Params) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const { categoryId } = await params;

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

  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const payload: Record<string, unknown> = { updated_at: now };
  if (body.name !== undefined) payload.name = body.name;
  if (body.icon !== undefined) payload.icon = body.icon;
  if (body.is_active !== undefined) payload.is_active = body.is_active;

  const { data, error } = await admin
    .from("categories")
    .update(payload)
    .eq("category_id", categoryId)
    .select("*")
    .maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Category not found" }, { status: 404 });
  }

  return Response.json({ category: data });
}
