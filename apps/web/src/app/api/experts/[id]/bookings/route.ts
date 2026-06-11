import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { prepareExpertSessionBooking } from "@/lib/session-booking-prepare";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  startUtcMs: z.number(),
  durationMinutes: z.number().int().positive(),
  applyFirstSessionDiscount: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const expertUserId = (await params).id;
  const learnerId = await getAuthedUserId();
  if (!learnerId) {
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
  const { startUtcMs, durationMinutes, applyFirstSessionDiscount } = parsed.data;

  const admin = createAdminClient();
  const prepared = await prepareExpertSessionBooking(admin, {
    learnerUserId: learnerId,
    expertUserId,
    startUtcMs,
    durationMinutes,
    applyFirstSessionDiscount,
  });

  if (!prepared.ok) {
    return Response.json({ error: prepared.error }, { status: prepared.status });
  }

  const d = prepared.data;
  const now = new Date().toISOString();

  if (d.autoAccept) {
    return Response.json({
      auto_accept: true,
      deferred_checkout: true,
      pricing: d.pricing,
      startUtcMs,
      durationMinutes,
      applyFirstSessionDiscount: Boolean(applyFirstSessionDiscount),
    });
  }

  const paymentStatus = "awaiting_expert";
  const { data: booking, error: insertErr } = await admin
    .from("bookings")
    .insert({
      expert_user_id: d.expertUserId,
      learner_user_id: d.learnerUserId,
      expert_profile_id: d.expertProfileId,
      session_date: d.sessionDate,
      start_time: d.startTime,
      end_time: d.endTime,
      duration: d.durationPg,
      rate: d.rateHourly,
      discount_applied: d.discountApplied,
      booking_amount: d.pricing.booking_amount,
      platform_fee: d.pricing.platform_fee,
      taxes_fees: d.pricing.taxes_fees,
      total_amount: d.pricing.total_amount,
      status: "upcoming",
      payment_status: paymentStatus,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insertErr) {
    return Response.json({ error: publicApiError(insertErr) }, { status: 500 });
  }

  return Response.json({
    booking,
    pricing: d.pricing,
    auto_accept: false,
  });
}
