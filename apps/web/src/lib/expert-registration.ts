import { z } from "zod";

export const experienceLevels = [
  "Less than 1 year",
  "3-5 Years",
  "6-10 Years",
  "10-20 Years",
  "20+ Years",
] as const;

export const membershipTiers = ["free", "verified", "enterprise"] as const;

const payoutDetailsSchema = z
  .object({
    legal_name: z.string().max(200).optional(),
    address_line1: z.string().max(200).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(80).optional(),
    postal_code: z.string().max(20).optional(),
    country: z.string().max(80).optional(),
    routing_number: z.string().max(32).optional(),
    account_number: z.string().max(32).optional(),
    tax_id_last4: z.string().max(4).optional(),
  })
  .optional();

export const expertRegistrationPatchSchema = z
  .object({
    current_step: z.number().int().min(1).max(9).optional(),
    // shared user fields (written to users)
    first_name: z.string().max(200).optional(),
    last_name: z.string().max(200).optional(),
    phone_number: z.string().max(80).nullable().optional(),
    hometown: z.string().max(200).nullable().optional(),
    time_zone: z.string().max(100).nullable().optional(),
    profession: z.string().max(200).nullable().optional(),
    profile_photo: z.string().max(2000).nullable().optional(),
    language: z.string().max(80).nullable().optional(),
    introduction: z.string().max(8000).nullable().optional(),
    birthday: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
      .optional(),
    gender: z.string().max(80).nullable().optional(),

    // expert profile fields
    category_id: z.string().uuid().nullable().optional(),
    experience_level: z.enum(experienceLevels).nullable().optional(),
    qualifications: z.string().max(8000).optional(),
    expert_bio: z.string().max(1000).optional(),
    about_services: z.string().max(1000).optional(),
    skills_specializations: z.array(z.string().max(120)).max(30).optional(),
    membership_tier: z.enum(membershipTiers).optional(),

    // availability/booking fields
    rate_per_15_min: z.coerce.number().nonnegative().max(1_000_000).optional(),
    minimum_booking_minutes: z.number().int().positive().optional(),
    maximum_booking_minutes: z.number().int().positive().optional(),
    minimum_notice_minutes: z.number().int().nonnegative().optional(),
    maximum_notice_minutes: z.number().int().positive().optional(),
    buffer_time_minutes: z.number().int().nonnegative().optional(),
    auto_accept: z.boolean().optional(),
    allow_session_extensions: z.boolean().optional(),
    first_session_discount_enabled: z.boolean().optional(),
    first_session_discount_type: z.enum(["percent", "fixed_amount"]).nullable().optional(),
    first_session_discount_value: z.number().nonnegative().nullable().optional(),
    first_session_discount_max_session_minutes: z.number().int().positive().nullable().optional(),
    weekly_schedule: z.record(z.string(), z.array(z.object({ start: z.string(), end: z.string() }))).optional(),
    package_deal_enabled: z.boolean().optional(),
    package_session_count: z.number().int().positive().nullable().optional(),
    package_session_duration_minutes: z.number().int().positive().nullable().optional(),
    package_discount_type: z.enum(["percent", "fixed_amount"]).nullable().optional(),
    package_discount_value: z.number().nonnegative().nullable().optional(),
    package_require_purchase: z.boolean().optional(),
    package_require_purchase_after_first_session: z.boolean().optional(),
    payout_details: payoutDetailsSchema,
  })
  .strict();

export type ExpertRegistrationPatch = z.infer<typeof expertRegistrationPatchSchema>;

/** True when PATCH should write `expert_profiles.payout_details` (column may not exist until migration). */
export function expertPayoutDetailsPayloadHasValues(details: unknown): boolean {
  if (details == null || typeof details !== "object") return false;
  return Object.values(details as Record<string, unknown>).some((v) => {
    if (v == null) return false;
    if (typeof v === "string") return v.trim() !== "";
    return true;
  });
}

export function parseIsoTimeFromMinutes(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

export function parseIntervalFromMinutes(minutes: number | undefined): string | null | undefined {
  if (minutes === undefined) return undefined;
  const m = Math.max(0, Math.floor(minutes));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${hh} hours ${mm} minutes`;
}

/** Parse Postgres interval / app interval strings to minutes for registration UI. */
export function intervalStringToMinutes(input: unknown): number | null {
  if (input == null) return null;
  if (typeof input === "number" && Number.isFinite(input)) return Math.round(input);
  const s = String(input).trim();
  if (!s) return null;
  const iso = s.match(/^(\d+):(\d+):(\d+)$/);
  if (iso) {
    const h = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10);
    const sec = parseInt(iso[3], 10);
    return h * 60 + m + Math.round(sec / 60);
  }
  let total = 0;
  const hourMatch = s.match(/(\d+)\s*h(?:our)?s?/i);
  const minMatch = s.match(/(\d+)\s*m(?:inute)?s?/i);
  if (hourMatch) total += parseInt(hourMatch[1], 10) * 60;
  if (minMatch) total += parseInt(minMatch[1], 10);
  return total > 0 ? total : null;
}

export function requiredFieldErrors(payload: {
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  hometown?: string | null;
  time_zone?: string | null;
  profession?: string | null;
  category_id?: string | null;
  experience_level?: string | null;
  qualifications?: string | null;
  expert_bio?: string | null;
  about_services?: string | null;
  skills_specializations?: string[] | null;
  rate_per_15_min?: number | null;
  weekly_schedule?: Record<string, Array<{ start: string; end: string }>> | null;
}): string[] {
  const missing: string[] = [];
  if (!payload.first_name?.trim()) missing.push("first_name");
  if (!payload.last_name?.trim()) missing.push("last_name");
  if (!payload.hometown?.trim()) missing.push("hometown");
  if (!payload.time_zone?.trim()) missing.push("time_zone");
  if (!payload.profession?.trim()) missing.push("profession");
  if (!payload.category_id) missing.push("category_id");
  if (!payload.experience_level?.trim()) missing.push("experience_level");
  if (!payload.qualifications?.trim()) missing.push("qualifications");
  if (!payload.expert_bio?.trim()) missing.push("expert_bio");
  if (!payload.skills_specializations?.length) missing.push("skills_specializations");
  if (
    typeof payload.rate_per_15_min !== "number" ||
    !Number.isFinite(payload.rate_per_15_min) ||
    payload.rate_per_15_min <= 0
  ) {
    missing.push("rate_per_15_min");
  }
  const hasWeeklySlots = Object.values(payload.weekly_schedule ?? {}).some((slots) => slots.length > 0);
  if (!hasWeeklySlots) missing.push("weekly_schedule");
  return missing;
}
