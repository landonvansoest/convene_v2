import type { createAdminClient } from "@/lib/supabase/admin";
import {
  EXPERT_VISIBILITY_STATE,
  expertVisibilityStatesForBrowseGrid,
  isExpertProfilePubliclyViewable,
} from "@/lib/expertVisibilityState";
import { getFeaturedExpertsSettings } from "@/lib/featuredExpertsSettings";

export type SimilarExpertForEmail = {
  userId: string;
  name: string;
  profileUrl: string;
};

type ExpertProfileCandidate = {
  user_id: string;
  skills_specializations: string[] | null;
  complete_sessions: number | null;
  expert_visibility_state: string | null;
};

function displayName(row: {
  first_name: string | null;
  last_name: string | null;
  email_address: string | null;
}): string {
  const n = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return n || row.email_address || "Expert";
}

function normalizeSkills(skills: string[] | null | undefined): string[] {
  return (skills ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
}

function skillOverlapScore(source: string[], candidate: string[] | null | undefined): number {
  if (source.length === 0) return 0;
  const candidateSet = new Set(normalizeSkills(candidate));
  let score = 0;
  for (const skill of source) {
    if (candidateSet.has(skill)) score += 1;
  }
  return score;
}

function rankCandidates(
  sourceSkills: string[],
  candidates: ExpertProfileCandidate[],
  limit: number,
): string[] {
  return candidates
    .filter((row) => isExpertProfilePubliclyViewable(row.expert_visibility_state))
    .map((row) => ({
      userId: row.user_id,
      score: skillOverlapScore(sourceSkills, row.skills_specializations),
      completeSessions: Number(row.complete_sessions ?? 0),
    }))
    .sort((a, b) => b.score - a.score || b.completeSessions - a.completeSessions)
    .slice(0, limit)
    .map((r) => r.userId);
}

async function hydrateExpertNames(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
  appBaseUrl: string,
): Promise<SimilarExpertForEmail[]> {
  if (userIds.length === 0) return [];

  const { data: users } = await admin
    .from("users")
    .select("user_id, first_name, last_name, email_address")
    .in("user_id", userIds);

  const userById = new Map((users ?? []).map((u) => [u.user_id, u]));
  const base = appBaseUrl.replace(/\/$/, "");

  return userIds
    .map((userId) => {
      const user = userById.get(userId);
      if (!user) return null;
      return {
        userId,
        name: displayName(user),
        profileUrl: `${base}/experts/${userId}`,
      };
    })
    .filter((x): x is SimilarExpertForEmail => x != null);
}

async function browseVisibilityStates(admin: ReturnType<typeof createAdminClient>): Promise<string[]> {
  try {
    const featured = await getFeaturedExpertsSettings(admin);
    return expertVisibilityStatesForBrowseGrid(featured);
  } catch {
    return [EXPERT_VISIBILITY_STATE.VISIBLE_ACTIVE];
  }
}

/**
 * Up to `limit` similar experts for cancellation emails.
 * 1) Skill overlap across all browseable experts (requires ≥1 shared skill/tag).
 * 2) Same category as the canceled expert when step 1 finds nobody.
 */
export async function fetchSimilarExpertsForEmail(
  admin: ReturnType<typeof createAdminClient>,
  canceledExpertUserId: string,
  appBaseUrl: string,
  limit = 3,
): Promise<SimilarExpertForEmail[]> {
  const { data: sourceProfile } = await admin
    .from("expert_profiles")
    .select("user_id, category_id, skills_specializations, expert_visibility_state")
    .eq("user_id", canceledExpertUserId)
    .maybeSingle();

  if (!sourceProfile) return [];

  const visibilityStates = await browseVisibilityStates(admin);
  const sourceSkillsRaw = ((sourceProfile.skills_specializations as string[] | null) ?? [])
    .map((s) => String(s).trim())
    .filter(Boolean);
  const sourceSkills = normalizeSkills(sourceSkillsRaw);

  let rankedUserIds: string[] = [];

  if (sourceSkillsRaw.length > 0) {
    const { data: skillMatches, error: skillErr } = await admin
      .from("expert_profiles")
      .select("user_id, skills_specializations, complete_sessions, expert_visibility_state")
      .neq("user_id", canceledExpertUserId)
      .in("expert_visibility_state", visibilityStates)
      .overlaps("skills_specializations", sourceSkillsRaw)
      .limit(48);

    if (!skillErr && skillMatches?.length) {
      rankedUserIds = rankCandidates(
        sourceSkills,
        skillMatches as ExpertProfileCandidate[],
        limit,
      );
    }
  }

  if (rankedUserIds.length === 0 && sourceProfile.category_id) {
    const { data: categoryMatches, error: catErr } = await admin
      .from("expert_profiles")
      .select("user_id, skills_specializations, complete_sessions, expert_visibility_state")
      .eq("category_id", sourceProfile.category_id)
      .neq("user_id", canceledExpertUserId)
      .in("expert_visibility_state", visibilityStates)
      .limit(48);

    if (!catErr && categoryMatches?.length) {
      rankedUserIds = rankCandidates(
        sourceSkills,
        categoryMatches as ExpertProfileCandidate[],
        limit,
      );
    }
  }

  return hydrateExpertNames(admin, rankedUserIds, appBaseUrl);
}

/** Markdown-style bullet list — each expert name links to their profile in HTML email. */
export function formatSimilarExpertsList(experts: SimilarExpertForEmail[]): string {
  if (experts.length === 0) return "";
  return experts.map((e) => `• [${e.name}](${e.profileUrl})`).join("\n");
}

/** Same as similar_experts_list (hyperlinked names only, no intro or browse copy). */
export function formatSimilarExpertsSection(experts: SimilarExpertForEmail[]): string {
  return formatSimilarExpertsList(experts);
}
