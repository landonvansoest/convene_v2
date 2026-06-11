import { DashboardSkeleton } from "@/app/dashboard/DashboardSkeleton";

/**
 * Shown immediately on client navigation to `/dashboard` while the RSC tree
 * runs `loadDashboardBootstrap()` (session + profile + welcome inbox + summary).
 * Removes the “blank” gap after closing the sign-up wizard.
 */
export default function DashboardLoading() {
  return <DashboardSkeleton statusMessage="Loading your dashboard…" />;
}
