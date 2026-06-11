import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEV_TOOLS } from "@/lib/devTools/registry";
import { getDevToolsEnabledMap } from "@/lib/devTools/store";

export const dynamic = "force-dynamic";

/**
 * Returns the DEV tools registry joined with current enabled state.
 * Order follows the registry (authors control display order in code).
 */
export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const enabledMap = await getDevToolsEnabledMap(admin);

  const tools = DEV_TOOLS.map((def) => ({
    key: def.key,
    label: def.label,
    description: def.description,
    enabled: enabledMap[def.key],
  }));

  return Response.json({ tools });
}
