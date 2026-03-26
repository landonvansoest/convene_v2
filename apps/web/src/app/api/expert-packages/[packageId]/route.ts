import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ packageId: string }> };

const patchSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(8000).nullable().optional(),
    session_count: z.number().int().min(1).optional(),
    session_duration_minutes: z.number().int().min(1).optional(),
    price_cents: z.number().int().min(0).nullable().optional(),
    stripe_price_id: z.string().max(200).nullable().optional(),
    currency: z.string().length(3).optional(),
    is_published: z.boolean().optional(),
    status: z.enum(["active", "archived"]).optional(),
    display_order: z.number().int().optional(),
    credit_expiration_days: z.number().int().min(1).nullable().optional(),
  })
  .strict();

export async function PATCH(request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packageId } = await params;

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

  if (Object.keys(parsed.data).length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing, error: fetchErr } = await admin
    .from("expert_packages")
    .select("*")
    .eq("package_id", packageId)
    .maybeSingle();

  if (fetchErr) {
    return Response.json({ error: publicApiError(fetchErr) }, { status: 500 });
  }
  if (!existing || existing.expert_user_id !== userId) {
    return Response.json({ error: "Package not found" }, { status: 404 });
  }

  const nextPublished =
    parsed.data.is_published !== undefined ? parsed.data.is_published : existing.is_published;
  const nextPrice =
    parsed.data.price_cents !== undefined ? parsed.data.price_cents : existing.price_cents;
  const nextStripe =
    parsed.data.stripe_price_id !== undefined
      ? parsed.data.stripe_price_id
      : existing.stripe_price_id;

  if (nextPublished && nextPrice == null && !(typeof nextStripe === "string" && nextStripe.trim())) {
    return Response.json(
      { error: "Published packages require price_cents or stripe_price_id" },
      { status: 400 }
    );
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const p = parsed.data;
  if (p.title !== undefined) updatePayload.title = p.title;
  if (p.description !== undefined) updatePayload.description = p.description;
  if (p.session_count !== undefined) updatePayload.session_count = p.session_count;
  if (p.session_duration_minutes !== undefined) {
    updatePayload.session_duration_minutes = p.session_duration_minutes;
  }
  if (p.price_cents !== undefined) updatePayload.price_cents = p.price_cents;
  if (p.stripe_price_id !== undefined) updatePayload.stripe_price_id = p.stripe_price_id;
  if (p.currency !== undefined) updatePayload.currency = p.currency;
  if (p.is_published !== undefined) updatePayload.is_published = p.is_published;
  if (p.status !== undefined) updatePayload.status = p.status;
  if (p.display_order !== undefined) updatePayload.display_order = p.display_order;
  if (p.credit_expiration_days !== undefined) {
    updatePayload.credit_expiration_days = p.credit_expiration_days;
  }

  const { data: updated, error: updErr } = await admin
    .from("expert_packages")
    .update(updatePayload)
    .eq("package_id", packageId)
    .select("*")
    .single();

  if (updErr) {
    return Response.json({ error: publicApiError(updErr) }, { status: 500 });
  }

  return Response.json({ package: updated });
}
