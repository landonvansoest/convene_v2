import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  completeDeferredSessionPaymentTest,
  completeLegacyBookingPaymentTest,
  isSessionPaymentTestBypassAllowed,
} from "@/lib/dev-session-payment-test";
import { getAuthedUserId } from "@/lib/messages/service";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("deferred"),
    expertUserId: z.string().uuid(),
    startUtcMs: z.number(),
    durationMinutes: z.number().int().positive(),
    applyFirstSessionDiscount: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("legacy_booking"),
    bookingId: z.string().uuid(),
  }),
]);

/**
 * Non-production / explicit bypass only: mark a session paid without Stripe so join flows can be tested.
 * Deferred: creates the booking row (same as successful checkout). Legacy: finalizes an existing pending row.
 */
export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!(await isSessionPaymentTestBypassAllowed(admin))) {
    return Response.json({ error: "Session payment test bypass is not enabled" }, { status: 403 });
  }

  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.kind === "legacy_booking") {
    const r = await completeLegacyBookingPaymentTest(admin, parsed.data.bookingId, userId);
    if ("error" in r) {
      return Response.json({ error: r.error }, { status: r.status });
    }
    return Response.json({ ok: true });
  }

  const r = await completeDeferredSessionPaymentTest(admin, userId, {
    expertUserId: parsed.data.expertUserId,
    startUtcMs: parsed.data.startUtcMs,
    durationMinutes: parsed.data.durationMinutes,
    applyFirstSessionDiscount: parsed.data.applyFirstSessionDiscount,
  });
  if ("error" in r) {
    return Response.json({ error: r.error }, { status: r.status });
  }
  return Response.json({ ok: true, booking_id: r.booking_id });
}
