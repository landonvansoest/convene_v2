import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type PublicCategoryRow = {
  category_id: string;
  name: string;
  icon: string | null;
  is_active: boolean;
  display_order?: number | null;
  subcategories?: string[] | null;
};

/** Active categories for request forms and filters. */
export async function GET() {
  const admin = createAdminClient();

  const fullCols = "category_id, name, icon, is_active, display_order, subcategories";
  const baseCols = "category_id, name, icon, is_active";

  const fullRes = await admin
    .from("categories")
    .select(fullCols)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  let data = (fullRes.data ?? null) as PublicCategoryRow[] | null;
  let error = fullRes.error;

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("display_order") || msg.includes("subcategories") || msg.includes("schema cache")) {
      const fb = await admin
        .from("categories")
        .select(baseCols)
        .eq("is_active", true)
        .order("name", { ascending: true });
      data = (fb.data ?? null) as PublicCategoryRow[] | null;
      error = fb.error;
    }
  }

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const categories = (data ?? []).map((c) => ({
    ...c,
    display_order: typeof (c as { display_order?: number }).display_order === "number"
      ? (c as { display_order?: number }).display_order
      : 0,
    subcategories: Array.isArray((c as { subcategories?: unknown }).subcategories)
      ? (c as { subcategories: string[] }).subcategories
      : [],
  }));

  return Response.json({ categories });
}
