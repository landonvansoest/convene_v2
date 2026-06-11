import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STALE_AFTER_MS = 5 * 60 * 1000; // Bible: 5 minutes since last heartbeat/action.

function cronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(secret);
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("secret");
  if (!q) return false;
  try {
    const a = Buffer.from(q);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Backstop sweep for users.online.
 *
 * Bible: users.online = true while last user action or heartbeat is within the
 * last 5 minutes. The /api/me/heartbeat path keeps online=true rolling. This
 * sweep flips online=false for any user whose last_seen_at is older than 5
 * minutes (or null), catching the case where a tab was closed/crashed without
 * firing the offline beacon.
 */
export async function GET(request: Request) {
  if (!cronAuth(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoffIso = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("users")
    .update({ online: false })
    .eq("online", true)
    .or(`last_seen_at.is.null,last_seen_at.lt.${cutoffIso}`)
    .select("user_id");

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({
    success: true,
    swept: data?.length ?? 0,
    cutoff: cutoffIso,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
