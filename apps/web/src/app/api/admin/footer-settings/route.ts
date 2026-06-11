import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { getFooterSettings } from "@/lib/footerSettings";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  show_resources_links: z.boolean(),
  allow_payment_bypass_dev: z.boolean().optional(),
});

export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const settings = await getFooterSettings(admin);
  return Response.json({ settings });
}

export async function PUT(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error: readErr } = await admin
    .from("site_settings")
    .select("data")
    .eq("id", 1)
    .maybeSingle();
  if (readErr) {
    return Response.json({ error: publicApiError(readErr) }, { status: 500 });
  }

  const existing = (row?.data as Record<string, unknown> | null) ?? {};
  const nextData = {
    ...existing,
    show_resources_links: parsed.data.show_resources_links,
    ...(parsed.data.allow_payment_bypass_dev !== undefined
      ? { allow_payment_bypass_dev: parsed.data.allow_payment_bypass_dev }
      : {}),
  };

  const { error: upsertErr } = await admin
    .from("site_settings")
    .upsert({ id: 1, data: nextData, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (upsertErr) {
    return Response.json({ error: publicApiError(upsertErr) }, { status: 500 });
  }

  const settings = await getFooterSettings(admin);
  return Response.json({ success: true, settings });
}

