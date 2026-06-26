import { intervalStringToMinutes } from "@/lib/expert-registration";
import {
  normalizeWeeklySchedule,
  type WeeklyScheduleState,
  type WeeklySlot,
} from "@/components/expert/weeklyAvailabilityUtils";

function parseMinFromBookingCol(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const s = String(v);
  const m1 = s.match(/^(\d+)\s*minutes?$/i);
  if (m1) return Number(m1[1]);
  const m2 = s.match(/^(\d+):(\d{2}):(\d{2})/);
  if (m2) return Number(m2[1]) * 60 + Number(m2[2]);
  return undefined;
}

export type AvailabilityPutPatch = {
  weeklySchedule?: WeeklyScheduleState;
  dateOverrides?: Array<{ date: string; slots: WeeklySlot[] }>;
  ratePer15Min?: number;
  minDuration?: number | undefined;
  maxDuration?: number | undefined;
  minimumNoticeMinutes?: number | undefined;
  maximumNoticeMinutes?: number | undefined;
  bufferTimeMinutes?: number | undefined;
  autoAccept?: boolean;
  extendSessions?: boolean;
  firstSessionDiscountEnabled?: boolean;
  firstSessionDiscountType?: "percent" | "fixed_amount" | null;
  firstSessionDiscountValue?: number | null;
  firstSessionDiscountMaxSessionMinutes?: number | null;
  firstSessionDiscountEffectiveFrom?: string | null;
  firstSessionDiscountEffectiveUntil?: string | null;
  packageDealEnabled?: boolean;
  packageSessionCount?: number | null;
  packageSessionDurationMinutes?: number | null;
  packageDiscountType?: "percent" | "fixed_amount" | null;
  packageDiscountValue?: number | null;
  packageRequirePurchase?: boolean;
  packageRequirePurchaseAfterFirst?: boolean;
};

/** Build `PUT /api/experts/availability` JSON from current DB row + field overrides (merge-safe). */
export function availabilityRecordToPutBody(
  row: Record<string, unknown> | null | undefined,
  patch: AvailabilityPutPatch,
): Record<string, unknown> {
  const r = row ?? {};
  const hasRow = Boolean(row && typeof row === "object" && "user_id" in row);
  const weekly = patch.weeklySchedule ?? normalizeWeeklySchedule(r.weekly_schedule);
  let dateOverrides: Array<{ date: string; slots: WeeklySlot[] }>;
  if (patch.dateOverrides !== undefined) {
    dateOverrides = patch.dateOverrides;
  } else if (Array.isArray(r.availability_overrides)) {
    dateOverrides = r.availability_overrides as Array<{ date: string; slots: WeeklySlot[] }>;
  } else {
    dateOverrides = [];
  }

  const rate =
    patch.ratePer15Min !== undefined ? patch.ratePer15Min : Number(r.rate ?? 0);
  const minDuration =
    patch.minDuration !== undefined
      ? patch.minDuration
      : hasRow
        ? parseMinFromBookingCol(r.minimum_booking)
        : 30;
  const maxDuration =
    patch.maxDuration !== undefined
      ? patch.maxDuration
      : hasRow
        ? parseMinFromBookingCol(r.maximum_booking)
        : 120;

  const minNotice =
    patch.minimumNoticeMinutes !== undefined
      ? patch.minimumNoticeMinutes
      : hasRow && r.minimum_notice != null && r.minimum_notice !== ""
        ? intervalStringToMinutes(r.minimum_notice) ?? 0
        : hasRow
          ? 0
          : 0;
  const maxNotice =
    patch.maximumNoticeMinutes !== undefined
      ? patch.maximumNoticeMinutes
      : hasRow && r.maximum_notice != null && r.maximum_notice !== ""
        ? intervalStringToMinutes(r.maximum_notice) ?? 10080
        : hasRow
          ? 10080
          : 10080;
  const bufferTime =
    patch.bufferTimeMinutes !== undefined
      ? patch.bufferTimeMinutes
      : hasRow && r.buffer_time != null
        ? Number(r.buffer_time)
        : 0;

  const autoAccept =
    patch.autoAccept !== undefined
      ? patch.autoAccept
      : hasRow
        ? Boolean((r as { auto_accept?: boolean }).auto_accept ?? true)
        : true;
  const extendSessions =
    patch.extendSessions !== undefined
      ? patch.extendSessions
      : hasRow
        ? Boolean((r as { extend_sessions?: boolean }).extend_sessions ?? true)
        : true;

  const firstSessionDiscountEnabled =
    patch.firstSessionDiscountEnabled !== undefined
      ? patch.firstSessionDiscountEnabled
      : Boolean(r.first_session_discount_enabled ?? false);
  const firstSessionDiscountType =
    patch.firstSessionDiscountType !== undefined
      ? patch.firstSessionDiscountType
      : (r.first_session_discount_type as "percent" | "fixed_amount" | null) ?? null;
  const firstSessionDiscountValue =
    patch.firstSessionDiscountValue !== undefined
      ? patch.firstSessionDiscountValue
      : r.first_session_discount_value != null
        ? Number(r.first_session_discount_value)
        : null;
  const firstSessionDiscountMaxSessionMinutes =
    patch.firstSessionDiscountMaxSessionMinutes !== undefined
      ? patch.firstSessionDiscountMaxSessionMinutes
      : r.first_session_discount_max_session_minutes != null
        ? Number(r.first_session_discount_max_session_minutes)
        : null;

  const discFrom = r.first_session_discount_effective_from;
  const discUntil = r.first_session_discount_effective_until;
  const firstSessionDiscountEffectiveFrom =
    patch.firstSessionDiscountEffectiveFrom !== undefined
      ? patch.firstSessionDiscountEffectiveFrom
      : discFrom != null && String(discFrom).trim()
        ? String(discFrom).slice(0, 10)
        : null;
  const firstSessionDiscountEffectiveUntil =
    patch.firstSessionDiscountEffectiveUntil !== undefined
      ? patch.firstSessionDiscountEffectiveUntil
      : discUntil != null && String(discUntil).trim()
        ? String(discUntil).slice(0, 10)
        : null;

  const packageDealEnabled =
    patch.packageDealEnabled !== undefined
      ? patch.packageDealEnabled
      : Boolean((r as { package_deal_enabled?: boolean }).package_deal_enabled ?? false);
  const packageSessionCount =
    patch.packageSessionCount !== undefined
      ? patch.packageSessionCount
      : (r as { package_session_count?: number | null }).package_session_count ?? null;
  const packageSessionDurationMinutes =
    patch.packageSessionDurationMinutes !== undefined
      ? patch.packageSessionDurationMinutes
      : (r as { package_session_duration_minutes?: number | null }).package_session_duration_minutes ??
        null;
  const packageDiscountType =
    patch.packageDiscountType !== undefined
      ? patch.packageDiscountType
      : ((r as { package_discount_type?: string | null }).package_discount_type === "fixed_amount"
          ? "fixed_amount"
          : "percent") as "percent" | "fixed_amount" | null;
  const packageDiscountValue =
    patch.packageDiscountValue !== undefined
      ? patch.packageDiscountValue
      : (r as { package_discount_value?: number | null }).package_discount_value != null
        ? Number((r as { package_discount_value?: number | null }).package_discount_value)
        : null;
  const packageRequirePurchase =
    patch.packageRequirePurchase !== undefined
      ? patch.packageRequirePurchase
      : Boolean((r as { package_require_purchase?: boolean }).package_require_purchase ?? false);
  const packageRequirePurchaseAfterFirst =
    patch.packageRequirePurchaseAfterFirst !== undefined
      ? patch.packageRequirePurchaseAfterFirst
      : Boolean(
          (r as { package_require_purchase_after_first_session?: boolean })
            .package_require_purchase_after_first_session ?? false,
        );

  const requireImmediate = packageDealEnabled && packageRequirePurchase && !packageRequirePurchaseAfterFirst;
  const requireAfterFirst = packageDealEnabled && packageRequirePurchaseAfterFirst && !packageRequirePurchase;

  return {
    ratePer15Min: rate,
    weeklySchedule: weekly,
    dateOverrides,
    minDuration,
    maxDuration,
    firstSessionDiscountEnabled,
    firstSessionDiscountType: firstSessionDiscountEnabled ? firstSessionDiscountType : null,
    firstSessionDiscountValue: firstSessionDiscountEnabled ? firstSessionDiscountValue : null,
    firstSessionDiscountMaxSessionMinutes: firstSessionDiscountEnabled
      ? firstSessionDiscountMaxSessionMinutes
      : null,
    firstSessionDiscountEffectiveFrom: firstSessionDiscountEnabled ? firstSessionDiscountEffectiveFrom : null,
    firstSessionDiscountEffectiveUntil: firstSessionDiscountEnabled ? firstSessionDiscountEffectiveUntil : null,
    minimumNoticeMinutes: minNotice,
    maximumNoticeMinutes: maxNotice,
    bufferTimeMinutes: bufferTime,
    autoAccept,
    extendSessions,
    packageDealEnabled,
    packageSessionCount: packageDealEnabled ? packageSessionCount : null,
    packageSessionDurationMinutes: packageDealEnabled ? packageSessionDurationMinutes : null,
    packageDiscountType: packageDealEnabled ? packageDiscountType : null,
    packageDiscountValue: packageDealEnabled ? packageDiscountValue : null,
    packageRequirePurchase: requireImmediate,
    packageRequirePurchaseAfterFirst: requireAfterFirst,
  };
}
