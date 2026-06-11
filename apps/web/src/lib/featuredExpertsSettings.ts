import type { SupabaseClient } from "@supabase/supabase-js";

export type FeaturedExpertsSettings = {
  include_temp: boolean;
  include_pending: boolean;
  min_complete_sessions: number | null;
  require_verified: boolean;
  min_avg_rating: number | null;
  require_profile_picture: boolean;
};

const DEFAULTS: FeaturedExpertsSettings = {
  include_temp: true,
  include_pending: false,
  min_complete_sessions: null,
  require_verified: false,
  min_avg_rating: null,
  require_profile_picture: true,
};

/** Load singleton row; on missing table/row/column return defaults (dev before 010/030). */
export async function getFeaturedExpertsSettings(
  admin: SupabaseClient
): Promise<FeaturedExpertsSettings> {
  let { data, error } = await admin
    .from("featured_experts_settings")
    .select(
      "include_temp, include_pending, min_complete_sessions, require_verified, min_avg_rating, require_profile_picture"
    )
    .eq("singleton_id", 1)
    .maybeSingle();

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("require_profile_picture") || msg.includes("schema cache")) {
      // Migration 030 not applied — re-select without the column.
      ({ data, error } = await admin
        .from("featured_experts_settings")
        .select(
          "include_temp, include_pending, min_complete_sessions, require_verified, min_avg_rating"
        )
        .eq("singleton_id", 1)
        .maybeSingle());
    }
  }

  if (error || !data) {
    return { ...DEFAULTS };
  }

  const d = data as Record<string, unknown>;
  return {
    include_temp: Boolean(d.include_temp),
    include_pending: Boolean(d.include_pending),
    min_complete_sessions:
      d.min_complete_sessions == null ? null : Number(d.min_complete_sessions),
    require_verified: Boolean(d.require_verified),
    min_avg_rating: d.min_avg_rating == null ? null : Number(d.min_avg_rating),
    require_profile_picture:
      d.require_profile_picture == null
        ? DEFAULTS.require_profile_picture
        : Boolean(d.require_profile_picture),
  };
}

export { expertVisibilityStatesForBrowseGrid } from "@/lib/expertVisibilityState";
