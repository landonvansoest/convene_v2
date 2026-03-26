import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertPublicUserFromAuth } from "@/lib/users/sync-public-user";
import { publicApiError } from "@/lib/api/public-error";

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
  })
  .strict();

function nextLearnerVisibility(input: {
  email_verified: boolean;
  first_name: string;
  last_name: string;
}): "learner_hidden_email_unverified" | "learner_hidden_incomplete_fields" | "visible" {
  if (!input.email_verified) return "learner_hidden_email_unverified";
  if (!input.first_name.trim() || !input.last_name.trim()) {
    return "learner_hidden_incomplete_fields";
  }
  return "visible";
}

/**
 * Session + public.users profile (v2 schema). Ensures a profile row exists.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ user: null, profile: null }, { status: 200 });
  }

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("users")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    return Response.json({ error: publicApiError(fetchError) }, { status: 500 });
  }

  if (!existing) {
    try {
      await upsertPublicUserFromAuth(user);
    } catch (e) {
      return Response.json({ error: publicApiError(e, "upsert failed") }, { status: 500 });
    }
  }

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return Response.json({ error: publicApiError(profileError) }, { status: 500 });
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

  const admin = createAdminClient();
  const { data: current, error: curErr } = await admin
    .from("users")
    .select(
      "user_id, email_verified, first_name, last_name, has_expert_profile, profile_visibility_state"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (curErr || !current) {
    const errMsg = curErr ? publicApiError(curErr, "Profile not found") : "Profile not found";
    return Response.json({ error: errMsg }, { status: 404 });
  }

  const merged = {
    first_name: patch.first_name ?? current.first_name,
    last_name: patch.last_name ?? current.last_name,
    email_verified: current.email_verified,
  };

  let profile_visibility_state = current.profile_visibility_state;
  if (!current.has_expert_profile) {
    profile_visibility_state = nextLearnerVisibility({
      email_verified: merged.email_verified,
      first_name: merged.first_name ?? "",
      last_name: merged.last_name ?? "",
    });
  }

  let birthdayUpdate: string | null | undefined;
  if (patch.birthday !== undefined) {
    birthdayUpdate =
      patch.birthday === "" || patch.birthday === null ? null : patch.birthday;
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    profile_visibility_state,
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
