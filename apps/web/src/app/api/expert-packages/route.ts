import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(8000).nullable().optional(),
    session_count: z.number().int().min(1),
    session_duration_minutes: z.number().int().min(1),
    price_cents: z.number().int().min(0).nullable().optional(),
    stripe_price_id: z.string().max(200).nullable().optional(),
    currency: z.string().length(3).default("USD"),
    is_published: z.boolean().optional(),
    display_order: z.number().int().optional(),
    credit_expiration_days: z.number().int().min(1).nullable().optional(),
  })
  .strict();

/** Expert's own packages (all statuses / draft). */
export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("expert_packages")
    .select("*")
    .eq("expert_user_id", userId)
    .order("display_order", { ascending: true });

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ packages: data ?? [] });
}

export async function POST(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) {
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
  const { data: userRow } = await admin
    .from("users")
    .select("has_expert_profile")
    .eq("user_id", userId)
    .maybeSingle();

  if (!userRow?.has_expert_profile) {
    return Response.json({ error: "Expert profile required" }, { status: 403 });
  }

  const row = parsed.data;
  const isPublished = row.is_published ?? false;
  if (isPublished && row.price_cents == null && !row.stripe_price_id?.trim()) {
    return Response.json(
      { error: "Published packages require price_cents or stripe_price_id" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insErr } = await admin
    .from("expert_packages")
    .insert({
      expert_user_id: userId,
      title: row.title,
      description: row.description ?? null,
      session_count: row.session_count,
      session_duration_minutes: row.session_duration_minutes,
      price_cents: row.price_cents ?? null,
      stripe_price_id: row.stripe_price_id?.trim() || null,
      currency: row.currency,
      is_published: isPublished,
      display_order: row.display_order ?? 0,
      credit_expiration_days: row.credit_expiration_days ?? null,
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insErr) {
    return Response.json({ error: publicApiError(insErr) }, { status: 500 });
  }

  return Response.json({ package: inserted }, { status: 201 });
}
