import { ensureAppsWebEnvLoaded } from "@/lib/env/ensure-apps-web-env";
import { ensureWelcomeInboxForUser } from "@/lib/messages/welcome-inbox";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Idempotent client-callable safety net: ensures the one-time welcome DM after signup.
 * (Dashboard RSC also runs this; this covers client navigations / cache edge cases.)
 */
export async function POST() {
  try {
    ensureAppsWebEnvLoaded();
  } catch {
    /* ignore */
  }

  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureWelcomeInboxForUser(userId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: publicApiError(e, "Welcome inbox failed") }, { status: 500 });
  }
}
