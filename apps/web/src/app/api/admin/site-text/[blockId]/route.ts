import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ blockId: string }> };

const patchSchema = z
  .object({
    content: z.string().max(20000).optional(),
    label: z.string().min(1).max(200).trim().optional(),
    display_order: z.number().int().min(0).max(100000).optional(),
  })
  .strict();

export async function PATCH(request: Request, { params }: Params) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const { blockId } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.content !== undefined) payload.content = body.content;
  if (body.label !== undefined) payload.label = body.label;
  if (body.display_order !== undefined) payload.display_order = body.display_order;

  const { data, error } = await admin
    .from("site_text_blocks")
    .update(payload)
    .eq("block_id", blockId)
    .select(
      "block_id, page_slug, block_key, label, content, display_order, updated_at",
    )
    .maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Block not found" }, { status: 404 });
  }

  return Response.json({ block: data });
}
