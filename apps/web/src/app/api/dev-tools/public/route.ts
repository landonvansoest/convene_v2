import { createAdminClient } from "@/lib/supabase/admin";
import { getDevToolsEnabledMap } from "@/lib/devTools/store";

export const dynamic = "force-dynamic";

/**
 * Public (unauthenticated) view of DEV tool enabled flags. This only
 * returns boolean state — no secrets — so client components can decide
 * whether to render a dev button. Admin-only mutation still lives under
 * `/api/admin/dev-tools/[toolKey]`.
 */
export async function GET() {
  const admin = createAdminClient();
  const enabled = await getDevToolsEnabledMap(admin);
  return Response.json({ enabled });
}
