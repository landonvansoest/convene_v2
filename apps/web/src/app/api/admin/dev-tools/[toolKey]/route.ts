import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDevToolKey } from "@/lib/devTools/registry";
import { setDevToolEnabled } from "@/lib/devTools/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ toolKey: string }> };

const bodySchema = z.object({ enabled: z.boolean() }).strict();

export async function PATCH(request: Request, { params }: Params) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const { toolKey } = await params;
  if (!isDevToolKey(toolKey)) {
    return Response.json({ error: "Unknown DEV tool" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const result = await setDevToolEnabled(admin, toolKey, parsed.data.enabled);

  if (!result.ok) {
    if (result.migrationMissing) {
      return Response.json(
        {
          error:
            "DEV Tools table missing — apply migration 036_dev_tools.sql, then try again.",
          migrationRequired: true,
        },
        { status: 500 },
      );
    }
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json({ ok: true, key: toolKey, enabled: parsed.data.enabled });
}
