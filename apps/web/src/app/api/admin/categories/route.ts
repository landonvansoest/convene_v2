import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  icon: z.string().max(2048).nullable().optional(),
  is_active: z.boolean().optional(),
  subcategories: z.array(z.string().min(1).max(120).trim()).max(50).optional(),
  display_order: z.number().int().min(0).max(100000).optional(),
});

type AdminCategoryRow = {
  category_id: string;
  name: string;
  icon: string | null;
  is_active: boolean;
  display_order?: number | null;
  subcategories?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function schemaErrorMissingColumn(err: { message?: string | null } | null | undefined): boolean {
  const msg = err?.message?.toLowerCase() ?? "";
  return (
    msg.includes("display_order") ||
    msg.includes("subcategories") ||
    msg.includes("schema cache")
  );
}

function normalizeRow(row: AdminCategoryRow): AdminCategoryRow & {
  display_order: number;
  subcategories: string[];
} {
  return {
    ...row,
    display_order: typeof row.display_order === "number" ? row.display_order : 0,
    subcategories: Array.isArray(row.subcategories) ? row.subcategories : [],
  };
}

/** List all categories (including inactive), ordered by active desc, display_order asc, name asc. */
export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const fullCols =
    "category_id, name, icon, is_active, display_order, subcategories, created_at, updated_at";
  const baseCols = "category_id, name, icon, is_active, created_at, updated_at";

  let data: AdminCategoryRow[] | null = null;
  const fullRes = await admin
    .from("categories")
    .select(fullCols)
    .order("is_active", { ascending: false })
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  data = (fullRes.data ?? null) as AdminCategoryRow[] | null;
  let error = fullRes.error;

  if (error && schemaErrorMissingColumn(error)) {
    const fb = await admin
      .from("categories")
      .select(baseCols)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });
    data = (fb.data ?? null) as AdminCategoryRow[] | null;
    error = fb.error;
  }

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const rows = (data ?? []) as AdminCategoryRow[];
  return Response.json({ categories: rows.map(normalizeRow) });
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

  let nextOrder = parsed.data.display_order ?? null;
  if (nextOrder == null) {
    const { data: maxRow, error: maxErr } = await admin
      .from("categories")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!maxErr && maxRow && typeof maxRow.display_order === "number") {
      nextOrder = maxRow.display_order + 1;
    } else {
      nextOrder = 1;
    }
  }

  const insertBody: Record<string, unknown> = {
    name: parsed.data.name,
    icon: parsed.data.icon ?? null,
    is_active: parsed.data.is_active ?? true,
    created_at: now,
    updated_at: now,
    display_order: nextOrder,
    subcategories: parsed.data.subcategories ?? [],
  };

  let { data, error } = await admin
    .from("categories")
    .insert(insertBody)
    .select("*")
    .single();

  if (error && schemaErrorMissingColumn(error)) {
    const { display_order: _o, subcategories: _s, ...rest } = insertBody;
    void _o;
    void _s;
    ({ data, error } = await admin
      .from("categories")
      .insert(rest)
      .select("*")
      .single());
  }

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ category: normalizeRow(data as AdminCategoryRow) }, { status: 201 });
}
