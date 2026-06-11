import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicApiError } from "@/lib/api/public-error";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  user_id: z.string().uuid(),
  membership_tier: z.enum(["free", "verified", "enterprise"]),
  membership_price_override_cents: z.number().int().min(0).nullable().optional(),
  /** ISO-8601 timestamp (e.g. "2026-12-31T23:59:59Z") or null for indefinite. */
  membership_override_expires_at: z.string().datetime({ offset: true }).nullable().optional(),
});

const lookupSchema = z.object({
  user_id: z.string().uuid(),
});

/**
 * Strip the expiration column from the update body if the target schema
 * doesn't yet have migration 029 applied, so admin saves still succeed.
 */
async function updateWithExpirationFallback(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  update: Record<string, unknown>,
) {
  let result = await admin
    .from("expert_profiles")
    .update(update)
    .eq("user_id", userId)
    .select(
      "user_id, membership_tier, membership_price_override_cents, membership_override_expires_at, updated_at",
    )
    .maybeSingle();

  if (result.error) {
    const msg = result.error.message?.toLowerCase() ?? "";
    if (msg.includes("membership_override_expires_at") || msg.includes("schema cache")) {
      const { membership_override_expires_at: _ignored, ...rest } = update;
      void _ignored;
      result = await admin
        .from("expert_profiles")
        .update(rest)
        .eq("user_id", userId)
        .select(
          "user_id, membership_tier, membership_price_override_cents, updated_at",
        )
        .maybeSingle();
    }
  }

  return result;
}

async function selectOverridesWithFallback(admin: ReturnType<typeof createAdminClient>) {
  const full = await admin
    .from("expert_profiles")
    .select(
      "user_id, membership_tier, membership_price_override_cents, membership_override_expires_at, updated_at",
    )
    .or("membership_tier.neq.free,membership_price_override_cents.not.is.null")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (full.error) {
    const msg = full.error.message?.toLowerCase() ?? "";
    if (msg.includes("membership_override_expires_at") || msg.includes("schema cache")) {
      return await admin
        .from("expert_profiles")
        .select("user_id, membership_tier, membership_price_override_cents, updated_at")
        .or("membership_tier.neq.free,membership_price_override_cents.not.is.null")
        .order("updated_at", { ascending: false })
        .limit(500);
    }
  }

  return full;
}

async function selectExpertWithFallback(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  let result = await admin
    .from("expert_profiles")
    .select(
      "user_id, membership_tier, membership_price_override_cents, membership_override_expires_at, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) {
    const msg = result.error.message?.toLowerCase() ?? "";
    if (msg.includes("membership_override_expires_at") || msg.includes("schema cache")) {
      result = await admin
        .from("expert_profiles")
        .select(
          "user_id, membership_tier, membership_price_override_cents, updated_at",
        )
        .eq("user_id", userId)
        .maybeSingle();
    }
  }

  return result;
}

type OverrideRow = {
  user_id: string;
  membership_tier: "free" | "verified" | "enterprise";
  membership_price_override_cents: number | null;
  membership_override_expires_at?: string | null;
  updated_at: string | null;
};

/**
 * List all experts whose membership_tier is above `free` or who have a manual
 * price override set — these are the "admin-granted" memberships surfaced on
 * the admin inbox.
 */
export async function GET(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data: rows, error } = await selectOverridesWithFallback(admin);

  if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });

  const list = (rows ?? []) as OverrideRow[];
  if (list.length === 0) return Response.json({ experts: [] });

  const userIds = list.map((r) => r.user_id);
  const { data: users } = await admin
    .from("users")
    .select("user_id, email_address, first_name, last_name")
    .in("user_id", userIds);
  const byUser = new Map((users ?? []).map((u) => [u.user_id, u]));

  const experts = list.map((r) => {
    const u = byUser.get(r.user_id);
    return {
      user_id: r.user_id,
      email: u?.email_address ?? null,
      name: [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || null,
      first_name: u?.first_name ?? null,
      last_name: u?.last_name ?? null,
      membership_tier: r.membership_tier,
      membership_price_override_cents: r.membership_price_override_cents,
      membership_override_expires_at: r.membership_override_expires_at ?? null,
      updated_at: r.updated_at,
    };
  });

  return Response.json({ experts });
}

/**
 * Look up a single expert by user_id so the admin form can pre-fill when an
 * admin pastes a user_id into the "grant override" entry row.
 */
export async function POST(request: Request) {
  const denied = await assertAdmin(request);
  if (denied) return denied;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = lookupSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { user_id } = parsed.data;

  const [profileResult, userResult] = await Promise.all([
    selectExpertWithFallback(admin, user_id),
    admin
      .from("users")
      .select("user_id, email_address, first_name, last_name")
      .eq("user_id", user_id)
      .maybeSingle(),
  ]);

  if (profileResult.error) {
    return Response.json({ error: publicApiError(profileResult.error) }, { status: 500 });
  }
  if (userResult.error) {
    return Response.json({ error: publicApiError(userResult.error) }, { status: 500 });
  }
  if (!userResult.data) {
    return Response.json({ error: "No user with that ID" }, { status: 404 });
  }

  const profile = (profileResult.data ?? null) as OverrideRow | null;
  const user = userResult.data;

  return Response.json({
    expert: {
      user_id,
      email: user.email_address ?? null,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      name:
        [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
        user.email_address ||
        null,
      has_expert_profile: Boolean(profile),
      membership_tier: profile?.membership_tier ?? "free",
      membership_price_override_cents: profile?.membership_price_override_cents ?? null,
      membership_override_expires_at: profile?.membership_override_expires_at ?? null,
      updated_at: profile?.updated_at ?? null,
    },
  });
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
  const {
    user_id,
    membership_tier,
    membership_price_override_cents,
    membership_override_expires_at,
  } = parsed.data;

  const update: Record<string, unknown> = {
    membership_tier,
    membership_price_override_cents:
      membership_price_override_cents === undefined ? null : membership_price_override_cents,
    updated_at: new Date().toISOString(),
  };
  // Only include the expiration if caller sent it (undefined = leave as is).
  if (membership_override_expires_at !== undefined) {
    update.membership_override_expires_at = membership_override_expires_at;
  }

  const { data, error } = await updateWithExpirationFallback(admin, user_id, update);

  if (error) return Response.json({ error: publicApiError(error) }, { status: 500 });
  if (!data) return Response.json({ error: "Expert profile not found" }, { status: 404 });

  return Response.json({ success: true, expert: data });
}
