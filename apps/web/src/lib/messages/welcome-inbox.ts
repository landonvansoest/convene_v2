import { ensureAppsWebEnvLoaded } from "@/lib/env/ensure-apps-web-env";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateConversationForPair } from "@/lib/messages/service";
import {
  fetchMessageTemplate,
  resolveInAppFromTemplate,
  TEMPLATE_FALLBACKS,
} from "@/lib/notifications/message-templates";

async function welcomeLearnerInAppBody(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  const template = await fetchMessageTemplate(admin, "welcome_learner");
  const fb = TEMPLATE_FALLBACKS.welcome_learner;
  const resolved = resolveInAppFromTemplate(template, { recipient_name: "there" }, {
    subject: fb.in_app_subject,
    body: fb.in_app_body,
  });
  return resolved.enabled ? resolved.body : fb.in_app_body;
}

async function resolveUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const { data: exact } = await admin
    .from("users")
    .select("user_id")
    .eq("email_address", email)
    .maybeSingle();
  if (exact?.user_id) return exact.user_id as string;

  const { data: ci, error } = await admin
    .from("users")
    .select("user_id")
    .ilike("email_address", email)
    .maybeSingle();
  if (!error && ci?.user_id) return ci.user_id as string;
  return null;
}

export async function resolveConveneTeamUserId(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  try {
    ensureAppsWebEnvLoaded();
  } catch {
    /* fs unavailable (e.g. edge); rely on process.env only */
  }

  const envId = process.env.CONVENE_TEAM_USER_ID?.trim();
  if (envId) return envId;

  const email = process.env.CONVENE_TEAM_EMAIL?.trim();
  if (email) {
    const found = await resolveUserIdByEmail(admin, email);
    if (found) return found;
  }

  // Fallback: resolve a dedicated "Team Convene" profile if env vars are unset.
  const byName = await admin
    .from("users")
    .select("user_id")
    .ilike("first_name", "Team")
    .ilike("last_name", "Convene")
    .maybeSingle();
  if (!byName.error && byName.data?.user_id) return byName.data.user_id as string;

  // Last-resort fallback for local/dev setups.
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (adminEmail) {
    const byAdminEmail = await resolveUserIdByEmail(admin, adminEmail);
    if (byAdminEmail) return byAdminEmail;
  }

  return null;
}

/**
 * Resolves the public.users row that posts as "Convene Support" on help-ticket
 * conversations. Distinct from `resolveConveneTeamUserId` (the welcome-inbox
 * sender) so the two personas can be configured to different accounts.
 *
 * Resolution order:
 *   1. CONVENE_SUPPORT_USER_ID  (explicit UUID)
 *   2. CONVENE_SUPPORT_EMAIL    (email lookup against public.users)
 *   3. Profile named "Convene Support"
 *   4. Fallback to resolveConveneTeamUserId so existing single-account
 *      installs keep working.
 */
export async function resolveConveneSupportUserId(
  admin: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  try {
    ensureAppsWebEnvLoaded();
  } catch {
    /* fs / edge */
  }

  const envId = process.env.CONVENE_SUPPORT_USER_ID?.trim();
  if (envId) return envId;

  const email = process.env.CONVENE_SUPPORT_EMAIL?.trim();
  if (email) {
    const found = await resolveUserIdByEmail(admin, email);
    if (found) return found;
  }

  const byName = await admin
    .from("users")
    .select("user_id")
    .ilike("first_name", "Convene")
    .ilike("last_name", "Support")
    .maybeSingle();
  if (!byName.error && byName.data?.user_id) return byName.data.user_id as string;

  return resolveConveneTeamUserId(admin);
}

/**
 * Sends the one-time welcome DM from the Convene team account (`CONVENE_TEAM_USER_ID` or `CONVENE_TEAM_EMAIL`).
 * Idempotent via `users.welcome_inbox_sent_at` (claim with conditional update).
 */
export async function ensureWelcomeInboxForUser(recipientUserId: string): Promise<void> {
  try {
    ensureAppsWebEnvLoaded();
  } catch {
    /* fs / edge */
  }
  const admin = createAdminClient();
  const teamId = await resolveConveneTeamUserId(admin);
  if (!teamId || teamId === recipientUserId) {
    console.warn(
      "[welcome-inbox] Skipped: no sender found. Set CONVENE_TEAM_USER_ID or CONVENE_TEAM_EMAIL in apps/web env (and ensure that Auth user exists in public.users).",
    );
    return;
  }

  const nowIso = new Date().toISOString();

  const { data: claimed, error: claimErr } = await admin
    .from("users")
    .update({ welcome_inbox_sent_at: nowIso })
    .eq("user_id", recipientUserId)
    .is("welcome_inbox_sent_at", null)
    .select("user_id")
    .maybeSingle();

  if (claimErr) {
    const msg = claimErr.message?.toLowerCase() ?? "";
    if (msg.includes("welcome_inbox") || msg.includes("column") || msg.includes("schema cache")) {
      console.warn(
        "[welcome-inbox] Claim failed (run supabase/v2/014_welcome_inbox_sent.sql if this column is missing):",
        claimErr.message
      );
      return;
    }
    throw new Error(claimErr.message);
  }
  if (!claimed?.user_id) {
    return;
  }

  try {
    const { data: teamRow } = await admin.from("users").select("user_id").eq("user_id", teamId).maybeSingle();
    if (!teamRow) {
      await admin.from("users").update({ welcome_inbox_sent_at: null }).eq("user_id", recipientUserId);
      return;
    }

    const convo = await findOrCreateConversationForPair(teamId, recipientUserId);
    const welcomeBody = await welcomeLearnerInAppBody(admin);
    const { data: inserted, error: insErr } = await admin
      .from("messages")
      .insert({
        conversation_id: convo.conversation_id,
        sender_id: teamId,
        message: welcomeBody,
        is_read: false,
        metadata: { welcome: true },
      })
      .select("message_id, created_at")
      .single();

    if (insErr) {
      throw new Error(insErr.message);
    }

    await admin
      .from("conversations")
      .update({ updated_at: nowIso, last_message_at: inserted.created_at })
      .eq("conversation_id", convo.conversation_id);
  } catch (e) {
    await admin.from("users").update({ welcome_inbox_sent_at: null }).eq("user_id", recipientUserId);
    throw e;
  }
}

/**
 * One-time DM from the Convene team after expert registration submit. Idempotent via message metadata.
 */
export async function ensureExpertRegistrationWelcomeInbox(
  recipientUserId: string,
  opts?: { profileUrl?: string }
): Promise<void> {
  const admin = createAdminClient();
  const teamId = await resolveConveneTeamUserId(admin);
  if (!teamId || teamId === recipientUserId) {
    console.warn("[expert-registration-welcome] Skipped: no Convene team sender resolved.");
    return;
  }

  const base =
    (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")) || "https://convene.io";
  const profileUrl = opts?.profileUrl ?? `${base}/experts/${recipientUserId}`;

  const template = await fetchMessageTemplate(admin, "expert_registration_welcome");
  const fb = TEMPLATE_FALLBACKS.expert_registration_welcome;
  const resolved = resolveInAppFromTemplate(
    template,
    { profile_url: profileUrl },
    { subject: fb.in_app_subject, body: fb.in_app_body },
  );
  const message = resolved.enabled ? resolved.body : fb.in_app_body.replace("{{profile_url}}", profileUrl);

  const convo = await findOrCreateConversationForPair(teamId, recipientUserId);
  const { data: existing } = await admin
    .from("messages")
    .select("message_id")
    .eq("conversation_id", convo.conversation_id)
    .eq("sender_id", teamId)
    .contains("metadata", { expert_registration_welcome: true })
    .maybeSingle();

  if (existing?.message_id) return;

  const nowIso = new Date().toISOString();
  const { data: inserted, error: insErr } = await admin
    .from("messages")
    .insert({
      conversation_id: convo.conversation_id,
      sender_id: teamId,
      message,
      is_read: false,
      metadata: { expert_registration_welcome: true },
    })
    .select("message_id, created_at")
    .single();

  if (insErr) {
    console.error("[expert-registration-welcome]", insErr.message);
    return;
  }

  await admin
    .from("conversations")
    .update({ updated_at: nowIso, last_message_at: inserted.created_at })
    .eq("conversation_id", convo.conversation_id);
}
