import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import {
  AUTOMATION_CATALOG,
  TEMPLATE_FALLBACKS,
} from "@/lib/notifications/message-templates";

export const dynamic = "force-dynamic";

const SELECT_COLS =
  "template_id, automation_key, automation_label, automation_description, " +
  "in_app_enabled, in_app_subject, in_app_body, " +
  "email_enabled, email_subject, email_body, email_cta_url, email_cta_label, " +
  "sms_enabled, sms_body, " +
  "display_order, created_at, updated_at";

/**
 * Admin list of all multi-channel message templates, ordered for display.
 * Gracefully returns an empty list when migration 034 has not been applied
 * so the admin UI renders instead of throwing.
 */
export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("message_templates")
    .select(SELECT_COLS)
    .order("display_order", { ascending: true })
    .order("automation_label", { ascending: true });

  if (error) {
    // Migration 034 not yet applied — surface an empty list so the UI loads.
    if (
      error.code === "42P01" ||
      /relation .*message_templates.* does not exist/i.test(error.message ?? "")
    ) {
      const templates = Object.values(TEMPLATE_FALLBACKS)
        .sort((a, b) => a.display_order - b.display_order)
        .map((t) => ({
          template_id: `fallback-${t.automation_key}`,
          ...t,
          created_at: null,
          updated_at: null,
        }));
      return Response.json({
        templates,
        migrationRequired: true,
        readOnly: true,
        catalog: AUTOMATION_CATALOG,
      });
    }
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  return Response.json({
    templates: data ?? [],
    migrationRequired: false,
    readOnly: false,
    catalog: AUTOMATION_CATALOG,
  });
}
