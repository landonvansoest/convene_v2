import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  icon: z.string().max(80).nullable().optional(),
  is_active: z.boolean().optional(),
});

/** List all categories (including inactive). */
export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("categories")
    .select("category_id, name, icon, is_active, created_at, updated_at")
    .order("name", { ascending: true });

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ categories: data ?? [] });
}

export async function POST(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("categories")
    .insert({
      name: parsed.data.name,
      icon: parsed.data.icon ?? null,
      is_active: parsed.data.is_active ?? true,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ category: data }, { status: 201 });
}
