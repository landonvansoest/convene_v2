import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { persistBookingDependability } from "@/lib/dependability-persist";
import { dispatchBookingNoShowAlert } from "@/lib/notifications/admin-alerts";

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

    if (ids.length > 0) {
      const { data: noShowRows } = await admin
        .from("bookings")
        .select(
          "booking_id, session_date, start_time, learner_user_id, expert_user_id, status, refund_review_status",
        )
        .in("booking_id", ids)
        .eq("status", "no_show_expert")
        .eq("refund_review_status", "pending");

      if (noShowRows?.length) {
        const userIds = [
          ...new Set(
            noShowRows.flatMap((r) => [r.learner_user_id, r.expert_user_id].filter(Boolean)),
          ),
        ] as string[];
        const { data: users } = userIds.length
          ? await admin
              .from("users")
              .select("user_id, first_name, last_name")
              .in("user_id", userIds)
          : { data: [] as Array<{ user_id: string; first_name: string | null; last_name: string | null }> };
        const nameById = new Map(
          (users ?? []).map((u) => [
            u.user_id,
            `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || null,
          ]),
        );

        for (const row of noShowRows) {
          try {
            await dispatchBookingNoShowAlert({
              bookingId: row.booking_id,
              sessionDate: String(row.session_date),
              startTime: String(row.start_time),
              learnerName: nameById.get(row.learner_user_id) ?? null,
              expertName: nameById.get(row.expert_user_id) ?? null,
            });
          } catch {
            /* best-effort */
          }
        }
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
