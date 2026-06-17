import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export async function fetchExpertVisibilityByUserIds(
  admin: Admin,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const uniq = [...new Set(userIds.filter(Boolean))];
  if (uniq.length === 0) return new Map();

  const { data, error } = await admin
    .from("expert_profiles")
    .select("user_id, expert_visibility_state")
    .in("user_id", uniq);

  if (error) throw error;

  return new Map(
    (data ?? []).map((row) => [
      String(row.user_id),
      (row.expert_visibility_state as string | null) ?? null,
    ]),
  );
}

export function partnerExpertVisibilityState(
  partnerUserId: string | null | undefined,
  partnerHasExpertProfile: boolean | null | undefined,
  visibilityByUserId: Map<string, string | null>,
): string | null {
  if (!partnerUserId || !partnerHasExpertProfile) return null;
  return visibilityByUserId.get(partnerUserId) ?? null;
}
