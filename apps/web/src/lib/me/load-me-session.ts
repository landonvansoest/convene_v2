import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureWelcomeInboxForUser } from "@/lib/messages/welcome-inbox";
import { upsertPublicUserFromAuth } from "@/lib/users/sync-public-user";
import { publicApiError } from "@/lib/api/public-error";

export type MeSessionUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
};

export type MeSessionResult =
  | { kind: "no_session" }
  | { kind: "ok"; user: MeSessionUser; profile: Record<string, unknown> | null }
  | { kind: "error"; user: MeSessionUser; message: string };

/**
 * Ensures public.users row exists and returns the same shape as GET /api/me.
 */
export async function loadMeSessionForRequest(): Promise<MeSessionResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { kind: "no_session" };
  }

  const inner = await loadMeProfileForAuthUser(user);
  if (inner.kind === "error") {
    return { kind: "error", user: inner.user, message: inner.message };
  }
  return { kind: "ok", user: inner.user, profile: inner.profile };
}

async function loadMeProfileForAuthUser(
  user: User,
): Promise<
  | { kind: "ok"; user: MeSessionUser; profile: Record<string, unknown> | null }
  | { kind: "error"; user: MeSessionUser; message: string }
> {
  const sessionUser: MeSessionUser = {
    id: user.id,
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
  };

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("users")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    return { kind: "error", user: sessionUser, message: publicApiError(fetchError) };
  }

  if (!existing) {
    try {
      await upsertPublicUserFromAuth(user);
    } catch (e) {
      return { kind: "error", user: sessionUser, message: publicApiError(e, "upsert failed") };
    }
  }

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return { kind: "error", user: sessionUser, message: publicApiError(profileError) };
  }

  // Await so the first dashboard /api/me response happens after the DM exists. A fire-and-forget
  // call races the client inbox fetch (GET /api/messages/conversations) and often showed an empty inbox.
  try {
    await ensureWelcomeInboxForUser(user.id);
  } catch (err) {
    console.error("[welcome-inbox]", err);
  }

  let enrichedProfile: Record<string, unknown> | null = profile ? { ...profile } : null;
  if (enrichedProfile?.has_expert_profile) {
    const { data: expertProfile } = await admin
      .from("expert_profiles")
      .select("expert_visibility_state")
      .eq("user_id", user.id)
      .maybeSingle();
    enrichedProfile.expert_visibility_state =
      (expertProfile?.expert_visibility_state as string | null) ?? null;
  }

  return { kind: "ok", user: sessionUser, profile: enrichedProfile };
}
