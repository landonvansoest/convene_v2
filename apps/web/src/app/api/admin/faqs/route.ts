import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  question: z.string().min(1).max(500).trim(),
  answer: z.string().max(10000).default(""),
  display_order: z.number().int().min(0).max(100000).optional(),
  is_published: z.boolean().optional(),
});

const SELECT_COLS =
  "faq_id, question, answer, display_order, is_published, created_at, updated_at";

/** Admin list of every FAQ (published and unpublished), ordered by display_order. */
export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("faqs")
    .select(SELECT_COLS)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ faqs: data ?? [] });
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
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  let nextOrder = parsed.data.display_order ?? null;
  if (nextOrder == null) {
    const { data: maxRow } = await admin
      .from("faqs")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    nextOrder =
      maxRow && typeof maxRow.display_order === "number" ? maxRow.display_order + 10 : 10;
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("faqs")
    .insert({
      question: parsed.data.question,
      answer: parsed.data.answer ?? "",
      display_order: nextOrder,
      is_published: parsed.data.is_published ?? true,
      created_at: now,
      updated_at: now,
    })
    .select(SELECT_COLS)
    .single();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ faq: data }, { status: 201 });
}
