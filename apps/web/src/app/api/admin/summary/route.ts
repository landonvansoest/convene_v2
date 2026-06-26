import { assertAdmin } from "@/lib/admin/assert-admin";
import { loadAdminSidebarCounts } from "@/lib/admin/sidebar-counts";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Counts powering the admin sidebar "new items pending review" badges.
 * Each count is best-effort — if the underlying table or migration isn't in
 * place yet we silently treat that source as zero rather than returning 500,
 * since the sidebar is cosmetic and must never block the dashboard.
 */
export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const counts = await loadAdminSidebarCounts(admin);

  return Response.json({ counts });
}
