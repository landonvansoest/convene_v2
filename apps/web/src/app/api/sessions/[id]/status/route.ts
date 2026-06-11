import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { persistBookingDependability } from "@/lib/dependability-persist";
import { dispatchBookingCanceled } from "@/lib/notifications/booking-notifications";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bookingStatusSchema = z.enum([
  "upcoming",
  "live",
  "complete",
  "cancelled",
  "no_show_expert",
  "no_show_learner",
  "no_show",
]);

const updateStatusSchema = z.object({
  status: bookingStatusSchema,
  cancellationReason: z.string().max(2000).optional().nullable(),
});

export async function PUT(request: Request, { params }: Params) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateStatusSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing, error: fetchErr } = await admin
    .from("bookings")
    .select("booking_id, learner_user_id, expert_user_id")
    .eq("booking_id", id)
    .maybeSingle();
  if (fetchErr) return Response.json({ error: publicApiError(fetchErr) }, { status: 500 });
  if (!existing) return Response.json({ error: "Session not found" }, { status: 404 });

  if (existing.learner_user_id !== userId && existing.expert_user_id !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { status, cancellationReason } = parsed.data;
  const payload: Record<string, unknown> = {
    status,
    cancellation_reason: cancellationReason ?? null,
    updated_at: new Date().toISOString(),
  };
  if (status === "cancelled") {
    payload.cancelled_at = new Date().toISOString();
    payload.cancelled_by = userId;
  }

  const { error: updateErr } = await admin
    .from("bookings")
    .update(payload)
    .eq("booking_id", id);

  if (updateErr) {
    return Response.json({ error: publicApiError(updateErr) }, { status: 500 });
  }

  // Bible §"Dependability Rating": cancellation deductions (50/60/70/80/90/95
  // pts depending on how far before scheduled start) and no-show deductions
  // (100 pts) are recorded the moment the status changes. The persist helper
  // looks at the just-updated row and writes the per-side scores; a Postgres
  // trigger rolls them into the user-level averages.
  if (
    status === "cancelled" ||
    status === "no_show" ||
    status === "no_show_learner" ||
    status === "no_show_expert" ||
    status === "complete"
  ) {
    try {
      await persistBookingDependability(admin, id);
    } catch {
      // Non-fatal — score can be backfilled later.
    }
  }

  if (status === "cancelled") {
    try {
      await dispatchBookingCanceled(id);
    } catch (e) {
      console.error("[session-status] cancel notification failed", e);
    }
  }

  return Response.json({ message: "Session status updated" });
}
