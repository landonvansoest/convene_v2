import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { redeemPackageCreditForBooking } from "@/lib/packages/learner-package-credits";
import { prepareExpertSessionBooking } from "@/lib/session-booking-prepare";
import { recordFirstSessionDiscountRedemption } from "@/lib/pricing/first-session-discount";
import { dispatchBookingConfirmed } from "@/lib/notifications/booking-notifications";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  startUtcMs: z.number(),
  durationMinutes: z.number().int().positive(),
  applyFirstSessionDiscount: z.boolean().optional(),
  packageCreditId: z.string().uuid().optional(),
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
  const { startUtcMs, durationMinutes, applyFirstSessionDiscount, packageCreditId } = parsed.data;

  const admin = createAdminClient();
  const prepared = await prepareExpertSessionBooking(admin, {
    learnerUserId: learnerId,
    expertUserId,
    startUtcMs,
    durationMinutes,
    applyFirstSessionDiscount,
    packageCreditId,
  });

  if (!prepared.ok) {
    return Response.json({ error: prepared.error }, { status: prepared.status });
  }

  const d = prepared.data;
  const now = new Date().toISOString();

  if (d.packageCreditRedemption && d.packageCreditId) {
    const paymentStatus = "paid";
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
        discount_applied: 0,
        booking_amount: 0,
        platform_fee: 0,
        taxes_fees: 0,
        total_amount: 0,
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

    const redeemed = await redeemPackageCreditForBooking(admin, {
      creditId: d.packageCreditId,
      learnerUserId: learnerId,
      bookingId: String(booking.booking_id),
    });
    if (!redeemed.ok) {
      await admin.from("bookings").delete().eq("booking_id", booking.booking_id);
      return Response.json({ error: redeemed.error }, { status: redeemed.status });
    }

    try {
      await dispatchBookingConfirmed(String(booking.booking_id));
    } catch (e) {
      console.error("[bookings] package credit booking confirmed notification failed", e);
    }

    return Response.json({
      booking,
      pricing: d.pricing,
      auto_accept: d.autoAccept,
      package_credit_redeemed: true,
    });
  }

  if (d.autoAccept) {
    const complimentary =
      Boolean(applyFirstSessionDiscount) &&
      d.discountApplied > 0 &&
      d.pricing.total_amount <= 0;

    if (complimentary) {
      const paymentStatus = "paid";
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

      await recordFirstSessionDiscountRedemption(admin, {
        expertUserId: d.expertUserId,
        learnerUserId: learnerId,
        bookingId: String(booking.booking_id),
        discountApplied: d.discountApplied,
      });

      try {
        await dispatchBookingConfirmed(String(booking.booking_id));
      } catch (e) {
        console.error("[bookings] complimentary booking confirmed notification failed", e);
      }

      return Response.json({
        booking,
        pricing: d.pricing,
        auto_accept: true,
        complimentary: true,
      });
    }

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
