import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";
import {
  expertPayoutDetailsPayloadHasValues,
  expertRegistrationPatchSchema,
  intervalStringToMinutes,
  parseIntervalFromMinutes,
  requiredFieldErrors,
} from "@/lib/expert-registration";

export const dynamic = "force-dynamic";

/** After `supabase/v2/018_expert_availability_package_deal.sql`, set `EXPERT_AVAILABILITY_PACKAGE_COLUMNS=true` so PATCH can persist package fields. */
function expertAvailabilityPackageColumnsEnabled(): boolean {
  const v = process.env.EXPERT_AVAILABILITY_PACKAGE_COLUMNS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const EXPERT_PROFILE_BASE_COLUMNS =
  "user_id, category_id, experience_level, qualifications, expert_bio, about_services, skills_specializations, expert_visibility_state, membership_tier, stripe_connect_account_id";

export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: user } = await admin
    .from("users")
    .select(
      "first_name, last_name, phone_number, hometown, time_zone, profile_photo, profession, email_address, language, introduction, birthday, gender",
    )
    .eq("user_id", userId)
    .maybeSingle();

  let { data: expert, error: expertErr } = await admin
    .from("expert_profiles")
    .select(EXPERT_PROFILE_BASE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (expertErr) {
    return Response.json({ error: publicApiError(expertErr) }, { status: 500 });
  }

  if (!expert) {
    const { error: createErr } = await admin.from("expert_profiles").insert({
      user_id: userId,
      expert_visibility_state: "pending_admin_review",
      registration_started_at: now,
      updated_at: now,
    });
    if (createErr) return Response.json({ error: publicApiError(createErr) }, { status: 500 });
    const refetch = await admin.from("expert_profiles").select(EXPERT_PROFILE_BASE_COLUMNS).eq("user_id", userId).maybeSingle();
    expert = refetch.data ?? null;
    expertErr = refetch.error;
    if (expertErr) return Response.json({ error: publicApiError(expertErr) }, { status: 500 });
  }

  let payoutDetailsObj: Record<string, unknown> = {};
  const payoutRes = await admin.from("expert_profiles").select("payout_details").eq("user_id", userId).maybeSingle();
  if (!payoutRes.error && payoutRes.data?.payout_details && typeof payoutRes.data.payout_details === "object") {
    payoutDetailsObj = payoutRes.data.payout_details as Record<string, unknown>;
  }

  const { data: availability, error: availErr } = await admin
    .from("expert_availability")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (availErr) return Response.json({ error: publicApiError(availErr) }, { status: 500 });

  const profile = {
    email: user?.email_address ?? "",
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    phone_number: user?.phone_number ?? "",
    hometown: user?.hometown ?? "",
    time_zone: user?.time_zone ?? "UTC",
    profession: user?.profession ?? "",
    profile_photo: user?.profile_photo ?? null,
    language: user?.language ?? null,
    introduction: user?.introduction ?? "",
    birthday: user?.birthday ? String(user.birthday).slice(0, 10) : "",
    gender: user?.gender ?? "",
    category_id: expert?.category_id ?? null,
    experience_level: expert?.experience_level ?? null,
    qualifications: expert?.qualifications ?? "",
    expert_bio: expert?.expert_bio ?? "",
    about_services: expert?.about_services ?? "",
    skills_specializations: expert?.skills_specializations ?? [],
    membership_tier: expert?.membership_tier ?? "free",
    stripe_connect_account_id: (expert as { stripe_connect_account_id?: string | null } | null)?.stripe_connect_account_id ?? null,
    payout_details: payoutDetailsObj,
    rate_per_15_min:
      availability?.rate != null && availability.rate !== ""
        ? Number(availability.rate)
        : null,
    weekly_schedule:
      availability?.weekly_schedule && typeof availability.weekly_schedule === "object"
        ? availability.weekly_schedule
        : {},
    minimum_booking: availability?.minimum_booking ?? null,
    maximum_booking: availability?.maximum_booking ?? null,
    minimum_notice: availability?.minimum_notice ?? null,
    maximum_notice: availability?.maximum_notice ?? null,
    buffer_time_minutes: availability?.buffer_time != null ? Number(availability.buffer_time) : null,
    minimum_booking_minutes:
      availability?.minimum_booking != null && availability.minimum_booking !== ""
        ? intervalStringToMinutes(availability.minimum_booking)
        : null,
    maximum_booking_minutes:
      availability?.maximum_booking != null && availability.maximum_booking !== ""
        ? intervalStringToMinutes(availability.maximum_booking)
        : null,
    minimum_notice_minutes:
      availability?.minimum_notice != null && availability.minimum_notice !== ""
        ? intervalStringToMinutes(availability.minimum_notice)
        : null,
    maximum_notice_minutes:
      availability?.maximum_notice != null && availability.maximum_notice !== ""
        ? intervalStringToMinutes(availability.maximum_notice)
        : null,
    auto_accept: availability?.auto_accept ?? true,
    allow_session_extensions:
      (availability as { extend_sessions?: boolean } | null)?.extend_sessions ?? true,
    first_session_discount_enabled: availability?.first_session_discount_enabled ?? false,
    first_session_discount_type: availability?.first_session_discount_type ?? null,
    first_session_discount_value: availability?.first_session_discount_value ?? null,
    first_session_discount_max_session_minutes:
      availability?.first_session_discount_max_session_minutes ?? null,
    package_deal_enabled: (availability as { package_deal_enabled?: boolean } | null)?.package_deal_enabled ?? false,
    package_session_count: (availability as { package_session_count?: number | null } | null)?.package_session_count ?? null,
    package_session_duration_minutes:
      (availability as { package_session_duration_minutes?: number | null } | null)?.package_session_duration_minutes ?? null,
    package_discount_type: (availability as { package_discount_type?: string | null } | null)?.package_discount_type ?? null,
    package_discount_value: (availability as { package_discount_value?: number | null } | null)?.package_discount_value ?? null,
    package_require_purchase:
      (availability as { package_require_purchase?: boolean } | null)?.package_require_purchase ?? false,
    missing_required_fields: requiredFieldErrors({
      ...user,
      ...expert,
      rate_per_15_min: Number(availability?.rate ?? NaN),
      weekly_schedule:
        availability?.weekly_schedule && typeof availability.weekly_schedule === "object"
          ? availability.weekly_schedule
          : {},
    }),
  };

  return Response.json({
    draft: {
      current_step: 1,
      completed: false,
    },
    profile,
  });
}

export async function PATCH(request: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = expertRegistrationPatchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;
  if (
    data.time_zone != null &&
    String(data.time_zone).trim() &&
    !isValidIanaTimeZone(String(data.time_zone).trim())
  ) {
    return Response.json(
      { error: "time_zone must be a valid IANA timezone (e.g. America/New_York)" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const userUpdate: Record<string, unknown> = { updated_at: now };
  for (const key of [
    "first_name",
    "last_name",
    "phone_number",
    "hometown",
    "time_zone",
    "profession",
    "profile_photo",
    "language",
    "introduction",
    "gender",
  ] as const) {
    if (data[key] !== undefined) userUpdate[key] = data[key];
  }
  if (data.birthday !== undefined) {
    userUpdate.birthday =
      data.birthday === "" || data.birthday === null ? null : data.birthday;
  }
  if (Object.keys(userUpdate).length > 1) {
    const { error } = await admin.from("users").update(userUpdate).eq("user_id", userId);
    if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const { data: existingExpert } = await admin
    .from("expert_profiles")
    .select("expert_visibility_state")
    .eq("user_id", userId)
    .maybeSingle();
  const isActiveExpert = existingExpert?.expert_visibility_state === "visible_active";

  const expertUpdate: Record<string, unknown> = { updated_at: now };
  if (!isActiveExpert) {
    expertUpdate.expert_visibility_state = "pending_admin_review";
    expertUpdate.registration_started_at = now;
  }
  if (data.category_id !== undefined) expertUpdate.category_id = data.category_id;
  if (data.experience_level !== undefined) expertUpdate.experience_level = data.experience_level;
  if (data.qualifications !== undefined) expertUpdate.qualifications = data.qualifications;
  if (data.expert_bio !== undefined) expertUpdate.expert_bio = data.expert_bio;
  if (data.about_services !== undefined) expertUpdate.about_services = data.about_services;
  if (data.skills_specializations !== undefined) expertUpdate.skills_specializations = data.skills_specializations;
  if (data.membership_tier !== undefined) expertUpdate.membership_tier = data.membership_tier;
  if (expertPayoutDetailsPayloadHasValues(data.payout_details)) {
    expertUpdate.payout_details = data.payout_details as Record<string, unknown>;
  }

  const expertRow = { user_id: userId, ...expertUpdate };
  let { error: expertErr } = await admin.from("expert_profiles").upsert(expertRow, { onConflict: "user_id" });
  const expertErrMsg = expertErr ? publicApiError(expertErr).toLowerCase() : "";
  if (
    expertErr &&
    expertUpdate.payout_details !== undefined &&
    (expertErrMsg.includes("payout_details") || expertErrMsg.includes("schema cache"))
  ) {
    const { payout_details: _omit, ...expertSansPayout } = expertUpdate;
    const retry = await admin
      .from("expert_profiles")
      .upsert({ user_id: userId, ...expertSansPayout }, { onConflict: "user_id" });
    expertErr = retry.error;
  }
  if (expertErr) return Response.json({ error: publicApiError(expertErr) }, { status: 500 });

  const availabilityUpdate: Record<string, unknown> = {
    user_id: userId,
    updated_at: now,
    allow_messaging: true,
  };
  if (data.rate_per_15_min !== undefined) availabilityUpdate.rate = data.rate_per_15_min;
  if (data.weekly_schedule !== undefined) availabilityUpdate.weekly_schedule = data.weekly_schedule;
  if (data.minimum_booking_minutes !== undefined) {
    availabilityUpdate.minimum_booking = parseIntervalFromMinutes(data.minimum_booking_minutes);
  }
  if (data.maximum_booking_minutes !== undefined) {
    availabilityUpdate.maximum_booking = parseIntervalFromMinutes(data.maximum_booking_minutes);
  }
  if (data.minimum_notice_minutes !== undefined) {
    availabilityUpdate.minimum_notice = parseIntervalFromMinutes(data.minimum_notice_minutes);
  }
  if (data.maximum_notice_minutes !== undefined) {
    availabilityUpdate.maximum_notice = parseIntervalFromMinutes(data.maximum_notice_minutes);
  }
  if (data.buffer_time_minutes !== undefined) availabilityUpdate.buffer_time = data.buffer_time_minutes;
  if (data.auto_accept !== undefined) availabilityUpdate.auto_accept = data.auto_accept;
  if (data.allow_session_extensions !== undefined) {
    availabilityUpdate.extend_sessions = data.allow_session_extensions;
  }
  if (data.first_session_discount_enabled !== undefined) {
    availabilityUpdate.first_session_discount_enabled = data.first_session_discount_enabled;
  }
  if (data.first_session_discount_type !== undefined) {
    availabilityUpdate.first_session_discount_type = data.first_session_discount_type;
  }
  if (data.first_session_discount_value !== undefined) {
    availabilityUpdate.first_session_discount_value = data.first_session_discount_value;
  }
  if (data.first_session_discount_max_session_minutes !== undefined) {
    availabilityUpdate.first_session_discount_max_session_minutes =
      data.first_session_discount_max_session_minutes;
  }
  if (expertAvailabilityPackageColumnsEnabled()) {
    if (data.package_deal_enabled !== undefined) {
      availabilityUpdate.package_deal_enabled = data.package_deal_enabled;
    }
    if (data.package_session_count !== undefined) {
      availabilityUpdate.package_session_count = data.package_session_count;
    }
    if (data.package_session_duration_minutes !== undefined) {
      availabilityUpdate.package_session_duration_minutes = data.package_session_duration_minutes;
    }
    if (data.package_discount_type !== undefined) {
      availabilityUpdate.package_discount_type = data.package_discount_type;
    }
    if (data.package_discount_value !== undefined) {
      availabilityUpdate.package_discount_value = data.package_discount_value;
    }
    if (data.package_require_purchase !== undefined) {
      availabilityUpdate.package_require_purchase = data.package_require_purchase;
    }
  }
  const { error: availErr } = await admin
    .from("expert_availability")
    .upsert(availabilityUpdate, { onConflict: "user_id" });
  if (availErr) return Response.json({ error: publicApiError(availErr) }, { status: 500 });

  return Response.json({ success: true });
}
