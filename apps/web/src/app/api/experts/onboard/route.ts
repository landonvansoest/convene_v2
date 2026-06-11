import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/messages/service";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const onboardSchema = z.object({
  expert_bio: z.string().max(8000).default(""),
  qualifications: z.string().max(8000).default(""),
  experience_level: z.string().max(200).default(""),
  about_services: z.string().max(8000).default(""),
  skills: z.string().max(2000).default(""),
  category_id: z.string().uuid().nullable().optional(),
  /** USD per 15 minutes (`expert_availability.rate`). Preferred. */
  rate_per_15_min: z.coerce.number().nonnegative().max(1_000_000).optional(),
  /** @deprecated Legacy name; if sent without `rate_per_15_min`, treated as **hourly** USD and divided by 4 for storage. */
  hourly_rate: z.coerce.number().nonnegative().max(1_000_000).optional(),
});

function parseSkills(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

/**
 * Create or update expert profile for the signed-in user (pending admin / Stripe next).
 */
export async function POST(request: Request) {
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

  const parsed = onboardSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const {
    expert_bio,
    qualifications,
    experience_level,
    about_services,
    skills,
    category_id,
    rate_per_15_min,
    hourly_rate,
  } = parsed.data;
  const skills_specializations = parseSkills(skills);
  const now = new Date().toISOString();
  const admin = createAdminClient();

  const { data: existing, error: exErr } = await admin
    .from("expert_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (exErr) {
    return Response.json({ error: publicApiError(exErr) }, { status: 500 });
  }

  if (existing) {
    const { error: upErr } = await admin
      .from("expert_profiles")
      .update({
        expert_bio,
        qualifications,
        experience_level,
        about_services,
        skills_specializations,
        ...(category_id !== undefined ? { category_id } : {}),
        expert_visibility_state: "pending_admin_review",
        updated_at: now,
      })
      .eq("user_id", userId);

    if (upErr) {
      return Response.json({ error: publicApiError(upErr) }, { status: 500 });
    }
  } else {
    const { error: insErr } = await admin.from("expert_profiles").insert({
      user_id: userId,
      expert_bio,
      qualifications,
      experience_level,
      about_services,
      skills_specializations,
      category_id: category_id ?? null,
      expert_visibility_state: "pending_admin_review",
      updated_at: now,
    });

    if (insErr) {
      return Response.json({ error: publicApiError(insErr) }, { status: 500 });
    }
  }

  const { error: userErr } = await admin
    .from("users")
    .update({
      has_expert_profile: true,
      updated_at: now,
    })
    .eq("user_id", userId);

  if (userErr) {
    return Response.json({ error: publicApiError(userErr) }, { status: 500 });
  }

  let nextRate = 0;
  if (rate_per_15_min !== undefined) {
    nextRate = rate_per_15_min;
  } else if (hourly_rate !== undefined) {
    nextRate = hourly_rate / 4;
  } else {
    const { data: existingAvail } = await admin
      .from("expert_availability")
      .select("rate")
      .eq("user_id", userId)
      .maybeSingle();
    nextRate = Number(existingAvail?.rate ?? 0);
  }

  const { error: availErr } = await admin.from("expert_availability").upsert(
    {
      user_id: userId,
      rate: nextRate,
      weekly_schedule: {},
      availability_overrides: [],
      updated_at: now,
    },
    { onConflict: "user_id" }
  );

  if (availErr) {
    return Response.json({ error: publicApiError(availErr) }, { status: 500 });
  }

  return Response.json({ success: true, message: "Expert profile saved (pending review)." });
}
