import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

/**
 * Admin list of every editable text block across every page.
 * The admin UI groups rows by `page_slug` and renders each block's
 * label + content with an inline editor.
 */
export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("site_text_blocks")
    .select("block_id, page_slug, block_key, label, content, display_order, updated_at")
    .order("page_slug", { ascending: true })
    .order("display_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ blocks: data ?? [] });
}
