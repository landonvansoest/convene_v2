import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { persistBookingDependability } from "@/lib/dependability-persist";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * First-touch timestamps for Daily join: source of truth for no-show finalization.
 */
export async function POST(_request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const { data: b, error } = await admin
    .from("bookings")
    .select("booking_id, learner_user_id, expert_user_id, learner_joined, expert_joined")
    .eq("booking_id", id)
    .maybeSingle();

  if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });
  if (!b) return Response.json({ error: "Booking not found" }, { status: 404 });
  if (b.learner_user_id !== userId && b.expert_user_id !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = { updated_at: now };
  let recorded = false;

  if (b.learner_user_id === userId && b.learner_joined == null) {
    payload.learner_joined = now;
    recorded = true;
  }
  if (b.expert_user_id === userId && b.expert_joined == null) {
    payload.expert_joined = now;
    recorded = true;
  }

  if (!recorded) {
    return Response.json({ ok: true, recorded: false });
  }

  const { error: upErr } = await admin.from("bookings").update(payload).eq("booking_id", id);
  if (upErr) return Response.json({ error: publicApiError(upErr) }, { status: 500 });

  // Bible §"Dependability Rating": late-join deductions (5/10/20/50 pts at
  // 1–3 / 3–5 / 5–10 / 10+ min) are recorded the moment a join lands. The
  // helper derives learner_delay / expert_delay from the new join timestamp,
  // writes them, and updates the per-side dependability score; a Postgres
  // trigger then rolls those into the user-level rating.
  try {
    await persistBookingDependability(admin, id);
  } catch {
    // Non-fatal — the join is recorded, scoring can self-heal next call.
  }

  return Response.json({ ok: true, recorded: true });
}
