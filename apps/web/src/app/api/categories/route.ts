import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

/** Active categories for request forms and filters. */
export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("categories")
    .select("category_id, name, icon, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ categories: data ?? [] });
}
