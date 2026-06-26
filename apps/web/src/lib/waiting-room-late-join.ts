import { NO_SHOW_GRACE_MS } from "@/lib/resolveManualSessionEndStatus";
import { sessionWallClockInstant } from "@/lib/sessionWallClock";

export const LATE_JOIN_NOTICE_MS = 5 * 60 * 1000;
export const LATE_JOIN_REMIND_EVERY_MS = 5 * 60 * 1000;

export type LateJoinPhase = "none" | "five_min_info" | "ten_min_action";

export function lateJoinPhase(
  sessionDate: string | undefined,
  startTime: string | undefined,
  nowMs: number,
): LateJoinPhase {
  const start = sessionWallClockInstant(String(sessionDate ?? ""), startTime);
  if (!start) return "none";
  const elapsed = nowMs - start.getTime();
  if (elapsed < LATE_JOIN_NOTICE_MS) return "none";
  if (elapsed < NO_SHOW_GRACE_MS) return "five_min_info";
  return "ten_min_action";
}

export function partnerDisplayName(
  viewerRole: "learner" | "expert" | undefined,
  expert: { display_name: string } | null,
  learner: { display_name: string } | null,
  fallbackPartnerName?: string | null,
): string {
  if (viewerRole === "learner") {
    return expert?.display_name?.trim() || fallbackPartnerName?.trim() || "your expert";
  }
  return learner?.display_name?.trim() || fallbackPartnerName?.trim() || "your learner";
}
