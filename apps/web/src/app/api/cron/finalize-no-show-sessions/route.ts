import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { persistBookingDependability } from "@/lib/dependability-persist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function GET(request: Request) {
  if (!cronAuth(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("finalize_past_session_bookings");

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  // Bible §"Dependability Rating": once a booking transitions to a terminal
  // status (complete / no_show / no_show_*) the per-side scores must be
  // written. The RPC returns the booking_ids it touched; recompute each.
  let scoredCount = 0;
  try {
    const ids = extractBookingIds(data);
    for (const id of ids) {
      try {
        await persistBookingDependability(admin, id);
        scoredCount += 1;
      } catch {
        // Skip individual failures; cron is idempotent.
      }
    }
  } catch {
    // No-op — score persistence is best-effort here.
  }

  return Response.json({ success: true, result: data, scoredCount });
}

function extractBookingIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as { bookingIds?: unknown }).bookingIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
}

export async function POST(request: Request) {
  return GET(request);
}
