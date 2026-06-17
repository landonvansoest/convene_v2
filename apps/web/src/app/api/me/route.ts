import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { loadMeSessionForRequest } from "@/lib/me/load-me-session";

export const dynamic = "force-dynamic";

const profilePatchSchema = z
  .object({
    first_name: z.string().max(200).optional(),
    last_name: z.string().max(200).optional(),
    phone_number: z.string().max(80).nullable().optional(),
    hometown: z.string().max(200).nullable().optional(),
    time_zone: z.string().max(100).nullable().optional(),
    language: z.string().max(80).nullable().optional(),
    profession: z.string().max(200).nullable().optional(),
    introduction: z.string().max(8000).nullable().optional(),
    birthday: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
      .optional(),
    gender: z.string().max(80).nullable().optional(),
    profile_photo: z.string().max(2000).nullable().optional(),
    convene_role_mode: z.enum(["learner", "expert"]).optional(),
    /** Set only on wizard step 6 — stamps learner_registration_completed_at server-side. */
    complete_learner_registration: z.literal(true).optional(),
  })
  .strict();

function isValidIanaTimeZone(tz: string): boolean {
  try {
    // Intl throws RangeError for unknown time zone ids.
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Session + public.users profile (v2 schema). Ensures a profile row exists.
 */
export async function GET() {
  const me = await loadMeSessionForRequest();
  if (me.kind === "no_session") {
    return Response.json({ user: null, profile: null }, { status: 200 });
  }
  if (me.kind === "error") {
    return Response.json({ error: me.message }, { status: 500 });
  }
  return Response.json({
    user: {
      id: me.user.id,
      email: me.user.email,
      email_confirmed_at: me.user.email_confirmed_at,
    },
    profile: me.profile,
  });
}

/**
 * Update `public.users` for the signed-in user (allowed columns only).
 */
export async function PATCH(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = profilePatchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  if (patch.time_zone != null && patch.time_zone.trim() && !isValidIanaTimeZone(patch.time_zone)) {
    return Response.json(
      { error: "time_zone must be a valid IANA timezone (e.g. America/New_York)" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: current, error: curErr } = await admin
    .from("users")
    .select("user_id, has_expert_profile")
    .eq("user_id", user.id)
    .maybeSingle();

  if (curErr || !current) {
    const errMsg = curErr ? publicApiError(curErr, "Profile not found") : "Profile not found";
    return Response.json({ error: errMsg }, { status: 404 });
  }

  if (patch.convene_role_mode === "expert" && !current.has_expert_profile) {
    return Response.json(
      { error: "Cannot set convene_role_mode to expert without an expert profile." },
      { status: 400 }
    );
  }

  let birthdayUpdate: string | null | undefined;
  if (patch.birthday !== undefined) {
    birthdayUpdate =
      patch.birthday === "" || patch.birthday === null ? null : patch.birthday;
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.first_name !== undefined) updatePayload.first_name = patch.first_name;
  if (patch.last_name !== undefined) updatePayload.last_name = patch.last_name;
  if (patch.phone_number !== undefined) updatePayload.phone_number = patch.phone_number;
  if (patch.hometown !== undefined) updatePayload.hometown = patch.hometown;
  if (patch.time_zone !== undefined) updatePayload.time_zone = patch.time_zone;
  if (patch.language !== undefined) updatePayload.language = patch.language;
  if (patch.profession !== undefined) updatePayload.profession = patch.profession;
  if (patch.introduction !== undefined) updatePayload.introduction = patch.introduction;
  if (birthdayUpdate !== undefined) updatePayload.birthday = birthdayUpdate;
  if (patch.gender !== undefined) updatePayload.gender = patch.gender;
  if (patch.profile_photo !== undefined) updatePayload.profile_photo = patch.profile_photo;
  if (patch.convene_role_mode !== undefined) updatePayload.convene_role_mode = patch.convene_role_mode;
  if (patch.complete_learner_registration === true) {
    updatePayload.learner_registration_completed_at = new Date().toISOString();
  }

  const { error: updErr } = await admin
    .from("users")
    .update(updatePayload)
    .eq("user_id", user.id);

  if (updErr) {
    return Response.json({ error: publicApiError(updErr) }, { status: 500 });
  }

  const { data: profile, error: fetchErr } = await admin
    .from("users")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    return Response.json({ error: publicApiError(fetchErr) }, { status: 500 });
  }

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      email_confirmed_at: user.email_confirmed_at,
    },
    profile,
  });
}
