import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ templateId: string }> };

const patchSchema = z
  .object({
    automation_label: z.string().min(1).max(200).trim().optional(),
    automation_description: z.string().max(2000).optional(),
    in_app_enabled: z.boolean().optional(),
    in_app_subject: z.string().max(500).optional(),
    in_app_body: z.string().max(20000).optional(),
    email_enabled: z.boolean().optional(),
    email_subject: z.string().max(500).optional(),
    email_body: z.string().max(20000).optional(),
    sms_enabled: z.boolean().optional(),
    sms_body: z.string().max(1600).optional(),
    display_order: z.number().int().min(0).max(100000).optional(),
  })
  .strict();

const SELECT_COLS =
  "template_id, automation_key, automation_label, automation_description, " +
  "in_app_enabled, in_app_subject, in_app_body, " +
  "email_enabled, email_subject, email_body, " +
  "sms_enabled, sms_body, " +
  "display_order, created_at, updated_at";

export async function PATCH(request: Request, { params }: Params) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const { templateId } = await params;

  if (templateId.startsWith("fallback-")) {
    return Response.json(
      { error: "Run migration 034_message_templates.sql (and 049) before saving edits." },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of Object.keys(body) as Array<keyof typeof body>) {
    const value = body[key];
    if (value !== undefined) payload[key] = value;
  }

  const { data, error } = await admin
    .from("message_templates")
    .update(payload)
    .eq("template_id", templateId)
    .select(SELECT_COLS)
    .maybeSingle();

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }

  return Response.json({ template: data });
}
