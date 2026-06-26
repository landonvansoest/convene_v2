import type { createAdminClient } from "@/lib/supabase/admin";
import { sendTeamInAppMessage } from "@/lib/notifications/in-app-team-message";
import {
  fetchMessageTemplate,
  resolveInAppFromTemplate,
  TEMPLATE_FALLBACKS,
} from "@/lib/notifications/message-templates";

/** Send a Convene team inbox DM when the template's in-app channel is enabled. */
export async function dispatchInAppTemplateMessage(
  admin: ReturnType<typeof createAdminClient>,
  automationKey: string,
  recipientUserId: string,
  vars: Record<string, string>,
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const fb = TEMPLATE_FALLBACKS[automationKey];
  if (!fb || !recipientUserId) return false;

  const template = await fetchMessageTemplate(admin, automationKey);
  const inApp = resolveInAppFromTemplate(template, vars, {
    subject: fb.in_app_subject,
    body: fb.in_app_body,
  });
  if (!inApp.enabled || !inApp.body.trim()) return false;

  return sendTeamInAppMessage({
    recipientUserId,
    body: inApp.body,
    metadata: { automation_key: automationKey, ...metadata },
  });
}
