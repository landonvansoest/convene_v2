import { loadMeSessionForRequest } from "@/lib/me/load-me-session";
import { buildDashboardSummaryForUser } from "@/lib/dashboard/build-dashboard-summary";
import type { DashboardSummaryJson } from "@/app/dashboard/DashboardOverview";

export type DashboardBootstrap =
  | { kind: "guest" }
  | {
      kind: "authed";
      user: { id: string; email?: string | null; email_confirmed_at?: string | null };
      profile: Record<string, unknown> | null;
      summary: DashboardSummaryJson | null;
      summaryError: string | null;
      meError: string | null;
    };

/**
 * Server-only: session + profile ensure, then dashboard summary (sequential where required).
 */
export async function loadDashboardBootstrap(): Promise<DashboardBootstrap> {
  const me = await loadMeSessionForRequest();
  if (me.kind === "no_session") {
    return { kind: "guest" };
  }
  if (me.kind === "error") {
    return {
      kind: "authed",
      user: me.user,
      profile: null,
      summary: null,
      summaryError: null,
      meError: me.message,
    };
  }

  const summaryRes = await buildDashboardSummaryForUser(me.user.id);
  if (!summaryRes.ok) {
    return {
      kind: "authed",
      user: me.user,
      profile: me.profile,
      summary: null,
      summaryError: summaryRes.error,
      meError: null,
    };
  }

  return {
    kind: "authed",
    user: me.user,
    profile: me.profile,
    summary: summaryRes.data,
    summaryError: null,
    meError: null,
  };
}
