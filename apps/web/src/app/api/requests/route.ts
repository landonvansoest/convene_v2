import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(8000).default(""),
    category_id: z.string().uuid().nullable().optional(),
    skills: z.array(z.string().max(120)).max(10).default([]),
    is_public: z.boolean().optional(),
    expires_at: z.string().max(40).nullable().optional(),
  })
  .strict();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "20") || 20, 50);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0") || 0, 0);
  const categoryId = searchParams.get("category_id");
  const forYou = searchParams.get("for_you") === "1";

  const admin = createAdminClient();
  const callerId = await getAuthedUserId();

  let archivedIds = new Set<string>();
  if (forYou && callerId) {
    const { data: archived, error: archErr } = await admin
      .from("archived_requests")
      .select("request_id")
      .eq("expert_id", callerId);
    if (archErr) {
      return Response.json({ error: publicApiError(archErr) }, { status: 500 });
    }
    archivedIds = new Set((archived ?? []).map((a) => String(a.request_id)));
  }

  let q = admin
    .from("requests")
    .select(
      "request_id, user_id, title, description, category_id, skills, response_count, upvote_count, created_at, expires_at, is_public, is_active"
    )
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (forYou) {
    q = q.eq("is_active", true);
  }

  if (categoryId) {
    q = q.eq("category_id", categoryId);
  }

  const { data, error } = await q;
  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const rows = (data ?? []).filter((r) => !forYou || !archivedIds.has(String(r.request_id)));

  let upvotedIds = new Set<string>();
  let seenIds = new Set<string>();
  if (callerId && rows.length > 0) {
    const ids = rows.map((r) => r.request_id);
    const [{ data: mine }, { data: seen }] = await Promise.all([
      admin.from("request_upvotes").select("request_id").eq("user_id", callerId).in("request_id", ids),
      admin.from("seen_requests").select("request_id").eq("expert_id", callerId).in("request_id", ids),
    ]);
    upvotedIds = new Set((mine ?? []).map((r) => String(r.request_id)));
    seenIds = new Set((seen ?? []).map((r) => String(r.request_id)));
  }

  return Response.json({
    requests: rows.map((r) => ({
      ...r,
      i_upvoted: upvotedIds.has(String(r.request_id)),
      is_unseen: callerId ? !seenIds.has(String(r.request_id)) : false,
    })),
  });
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

  const row = parsed.data;
  const now = new Date().toISOString();
  const admin = createAdminClient();

  const { data: inserted, error: insErr } = await admin
    .from("requests")
    .insert({
      user_id: userId,
      title: row.title,
      description: row.description,
      category_id: row.category_id ?? null,
      skills: row.skills,
      is_public: row.is_public ?? true,
      is_active: true,
      response_count: 0,
      expires_at: row.expires_at ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insErr) {
    return Response.json({ error: publicApiError(insErr) }, { status: 500 });
  }

  return Response.json({ request: inserted }, { status: 201 });
}
