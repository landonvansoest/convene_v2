import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import { parseIntervalFromMinutes } from "@/lib/expert-registration";

export const dynamic = "force-dynamic";

const availabilitySchema = z
  .object({
    minDuration: z.number().int().positive().optional(),
    maxDuration: z.number().int().positive().optional(),
    /** USD per 15 minutes (`expert_availability.rate`). */
    ratePer15Min: z.number().nonnegative().optional(),
    /** @deprecated If sent without `ratePer15Min`, treated as hourly USD ÷ 4. */
    hourlyRate: z.number().nonnegative().optional(),
    weeklySchedule: z.record(z.string(), z.unknown()).default({}),
    dateOverrides: z.array(z.unknown()).default([]),
    firstSessionDiscountEnabled: z.boolean().optional(),
    firstSessionDiscountType: z.enum(["percent", "fixed_amount"]).nullable().optional(),
    firstSessionDiscountValue: z.number().nonnegative().nullable().optional(),
    firstSessionDiscountMaxSessionMinutes: z.number().int().positive().nullable().optional(),
    firstSessionDiscountEffectiveFrom: z.string().max(40).nullable().optional(),
    firstSessionDiscountEffectiveUntil: z.string().max(40).nullable().optional(),
    minimumNoticeMinutes: z.number().int().nonnegative().optional(),
    maximumNoticeMinutes: z.number().int().positive().optional(),
    bufferTimeMinutes: z.number().int().nonnegative().optional(),
    autoAccept: z.boolean().optional(),
    extendSessions: z.boolean().optional(),
    packageDealEnabled: z.boolean().optional(),
    packageSessionCount: z.number().int().positive().nullable().optional(),
    packageSessionDurationMinutes: z.number().int().positive().nullable().optional(),
    packageDiscountType: z.enum(["percent", "fixed_amount"]).nullable().optional(),
    packageDiscountValue: z.number().nonnegative().nullable().optional(),
    packageRequirePurchase: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.ratePer15Min === undefined && data.hourlyRate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Send ratePer15Min (USD per 15 min) or legacy hourlyRate",
        path: ["ratePer15Min"],
      });
    }
    if (data.firstSessionDiscountEnabled) {
      if (!data.firstSessionDiscountType || data.firstSessionDiscountValue == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "When discount is enabled, set type and value",
          path: ["firstSessionDiscountValue"],
        });
      }
    }
  });

/** Current expert’s `expert_availability` row (for form load). */
export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("expert_availability")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({ availability: data ?? null });
}

export async function PUT(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = availabilitySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const {
    minDuration,
    maxDuration,
    ratePer15Min,
    hourlyRate,
    weeklySchedule,
    dateOverrides,
    firstSessionDiscountEnabled,
    firstSessionDiscountType,
    firstSessionDiscountValue,
    firstSessionDiscountMaxSessionMinutes,
    firstSessionDiscountEffectiveFrom,
    firstSessionDiscountEffectiveUntil,
    minimumNoticeMinutes,
    maximumNoticeMinutes,
    bufferTimeMinutes,
    autoAccept,
    extendSessions,
    packageDealEnabled,
    packageSessionCount,
    packageSessionDurationMinutes,
    packageDiscountType,
    packageDiscountValue,
    packageRequirePurchase,
  } = parsed.data;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const rateStored =
    ratePer15Min !== undefined ? ratePer15Min : hourlyRate !== undefined ? hourlyRate / 4 : 0;
  const payload: Record<string, unknown> = {
    user_id: userId,
    rate: rateStored,
    weekly_schedule: weeklySchedule,
    availability_overrides: dateOverrides,
    minimum_booking: minDuration ? `${minDuration} minutes` : null,
    maximum_booking: maxDuration ? `${maxDuration} minutes` : null,
    updated_at: now,
  };

  if (firstSessionDiscountEnabled !== undefined) {
    payload.first_session_discount_enabled = firstSessionDiscountEnabled;
  }
  if (firstSessionDiscountType !== undefined) {
    payload.first_session_discount_type = firstSessionDiscountType;
  }
  if (firstSessionDiscountValue !== undefined) {
    payload.first_session_discount_value = firstSessionDiscountValue;
  }
  if (firstSessionDiscountMaxSessionMinutes !== undefined) {
    payload.first_session_discount_max_session_minutes = firstSessionDiscountMaxSessionMinutes;
  }
  if (firstSessionDiscountEffectiveFrom !== undefined) {
    payload.first_session_discount_effective_from = firstSessionDiscountEffectiveFrom?.trim()
      ? firstSessionDiscountEffectiveFrom
      : null;
  }
  if (firstSessionDiscountEffectiveUntil !== undefined) {
    payload.first_session_discount_effective_until = firstSessionDiscountEffectiveUntil?.trim()
      ? firstSessionDiscountEffectiveUntil
      : null;
  }

  if (minimumNoticeMinutes !== undefined) {
    payload.minimum_notice = parseIntervalFromMinutes(minimumNoticeMinutes) ?? null;
  }
  if (maximumNoticeMinutes !== undefined) {
    payload.maximum_notice = parseIntervalFromMinutes(maximumNoticeMinutes) ?? null;
  }
  if (bufferTimeMinutes !== undefined) {
    payload.buffer_time = bufferTimeMinutes;
  }
  if (autoAccept !== undefined) {
    payload.auto_accept = autoAccept;
  }
  if (extendSessions !== undefined) {
    payload.extend_sessions = extendSessions;
  }
  if (packageDealEnabled !== undefined) {
    payload.package_deal_enabled = packageDealEnabled;
  }
  if (packageSessionCount !== undefined) {
    payload.package_session_count = packageSessionCount;
  }
  if (packageSessionDurationMinutes !== undefined) {
    payload.package_session_duration_minutes = packageSessionDurationMinutes;
  }
  if (packageDiscountType !== undefined) {
    payload.package_discount_type = packageDiscountType;
  }
  if (packageDiscountValue !== undefined) {
    payload.package_discount_value = packageDiscountValue;
  }
  if (packageRequirePurchase !== undefined) {
    payload.package_require_purchase = packageRequirePurchase;
  }

  const { error } = await admin.from("expert_availability").upsert(payload, { onConflict: "user_id" });
  if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });

  return Response.json({ message: "Availability updated successfully" });
}

const calendarPauseSchema = z.object({ calendarPaused: z.boolean() });

/** Toggle whether public availability is hidden (bookings preserved). */
export async function PATCH(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = calendarPauseSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: existing, error: selErr } = await admin
    .from("expert_availability")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (selErr) return Response.json({ error: publicApiError(selErr) }, { status: 500 });

  if (!existing) {
    const { error: insErr } = await admin.from("expert_availability").insert({
      user_id: userId,
      calendar_paused: parsed.data.calendarPaused,
      updated_at: now,
    });
    if (insErr) return Response.json({ error: publicApiError(insErr) }, { status: 500 });
  } else {
    const { error: upErr } = await admin
      .from("expert_availability")
      .update({ calendar_paused: parsed.data.calendarPaused, updated_at: now })
      .eq("user_id", userId);
    if (upErr) return Response.json({ error: publicApiError(upErr) }, { status: 500 });
  }

  return Response.json({ ok: true, calendarPaused: parsed.data.calendarPaused });
}
