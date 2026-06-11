import { getAuthedUserId } from "@/lib/messages/service";
import { buildDashboardSummaryForUser } from "@/lib/dashboard/build-dashboard-summary";

export const dynamic = "force-dynamic";

/**
 * Aggregates dashboard overview + sidebar stats (Bible § Dashboard).
 */
export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await buildDashboardSummaryForUser(userId);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.data);
}
