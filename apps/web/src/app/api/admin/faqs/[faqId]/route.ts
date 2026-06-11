import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ faqId: string }> };

const patchSchema = z
  .object({
    question: z.string().min(1).max(500).trim().optional(),
    answer: z.string().max(10000).optional(),
    display_order: z.number().int().min(0).max(100000).optional(),
    is_published: z.boolean().optional(),
  })
  .strict();

const SELECT_COLS =
  "faq_id, question, answer, display_order, is_published, created_at, updated_at";

export async function PATCH(request: Request, { params }: Params) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const { faqId } = await params;

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
  if (body.question !== undefined) payload.question = body.question;
  if (body.answer !== undefined) payload.answer = body.answer;
  if (body.display_order !== undefined) payload.display_order = body.display_order;
  if (body.is_published !== undefined) payload.is_published = body.is_published;

  const { data, error } = await admin
    .from("faqs")
    .update(payload)
    .eq("faq_id", faqId)
    .select(SELECT_COLS)
    .maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "FAQ not found" }, { status: 404 });
  }

  return Response.json({ faq: data });
}

export async function DELETE(request: Request, { params }: Params) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const { faqId } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from("faqs").delete().eq("faq_id", faqId);

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  return Response.json({ success: true });
}
