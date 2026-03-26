import type { SupabaseClient } from "@supabase/supabase-js";

export type FeaturedExpertsSettings = {
  include_temp: boolean;
  include_pending: boolean;
  min_complete_sessions: number | null;
  require_verified: boolean;
  min_avg_rating: number | null;
};

const DEFAULTS: FeaturedExpertsSettings = {
  include_temp: true,
  include_pending: false,
  min_complete_sessions: null,
  require_verified: false,
  min_avg_rating: null,
};

/** Load singleton row; on missing table/row return defaults (dev before 010). */
export async function getFeaturedExpertsSettings(
  admin: SupabaseClient
): Promise<FeaturedExpertsSettings> {
  const { data, error } = await admin
    .from("featured_experts_settings")
    .select(
      "include_temp, include_pending, min_complete_sessions, require_verified, min_avg_rating"
    )
    .eq("singleton_id", 1)
    .maybeSingle();

  if (error || !data) {
    return { ...DEFAULTS };
  }

  return {
    include_temp: Boolean(data.include_temp),
    include_pending: Boolean(data.include_pending),
    min_complete_sessions:
      data.min_complete_sessions == null ? null : Number(data.min_complete_sessions),
    require_verified: Boolean(data.require_verified),
    min_avg_rating: data.min_avg_rating == null ? null : Number(data.min_avg_rating),
  };
}

export function expertStatusesForPublicList(s: FeaturedExpertsSettings): string[] {
  const statuses: string[] = ["active"];
  if (s.include_temp) statuses.push("temp");
  if (s.include_pending) statuses.push("pending");
  return statuses;
}
