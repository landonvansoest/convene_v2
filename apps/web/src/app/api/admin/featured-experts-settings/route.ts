import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";
import { getFeaturedExpertsSettings } from "@/lib/featuredExpertsSettings";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  include_temp: z.boolean(),
  include_pending: z.boolean(),
  min_complete_sessions: z.number().int().min(0).nullable(),
  require_verified: z.boolean(),
  min_avg_rating: z.number().min(1).max(5).nullable(),
  require_profile_picture: z.boolean().optional(),
});

export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const settings = await getFeaturedExpertsSettings(admin);
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
  const fullBody: Record<string, unknown> = {
    singleton_id: 1,
    include_temp: parsed.data.include_temp,
    include_pending: parsed.data.include_pending,
    min_complete_sessions: parsed.data.min_complete_sessions,
    require_verified: parsed.data.require_verified,
    min_avg_rating: parsed.data.min_avg_rating,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.require_profile_picture !== undefined) {
    fullBody.require_profile_picture = parsed.data.require_profile_picture;
  }

  let { error } = await admin
    .from("featured_experts_settings")
    .upsert(fullBody, { onConflict: "singleton_id" });

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("require_profile_picture") || msg.includes("schema cache")) {
      // Migration 030 not applied — retry without that column.
      const { require_profile_picture: _ignored, ...rest } = fullBody;
      void _ignored;
      ({ error } = await admin
        .from("featured_experts_settings")
        .upsert(rest, { onConflict: "singleton_id" }));
    }
  }

  if (error) {
    return Response.json({ error: publicApiError(error) }, { status: 500 });
  }

  const settings = await getFeaturedExpertsSettings(admin);
  return Response.json({ success: true, settings });
}
