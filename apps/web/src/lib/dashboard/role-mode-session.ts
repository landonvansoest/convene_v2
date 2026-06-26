export type ConveneRoleMode = "learner" | "expert";

/** True when a booking belongs to the other dashboard mode (learner vs coaching). */
export function isSessionInactiveForRoleMode(
  conveneRoleMode: ConveneRoleMode,
  sessionUserRole: string | undefined | null,
): boolean {
  const role = String(sessionUserRole ?? "").toLowerCase();
  if (conveneRoleMode === "expert") return role === "learner";
  if (conveneRoleMode === "learner") return role === "expert";
  return false;
}

export function switchModeJoinHint(conveneRoleMode: ConveneRoleMode): string {
  return conveneRoleMode === "expert" ? "Switch to Learning to Join" : "Switch to Coaching to Join";
}
