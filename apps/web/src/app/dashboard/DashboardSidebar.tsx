"use client";

import type { ReactNode } from "react";
import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { DashboardSummaryJson } from "./DashboardOverview";

export type SidebarEntry =
  | { kind: "view"; key: string; label: string; icon: ReactNode }
  | { kind: "link"; key: string; href: string; label: string; icon: ReactNode };

function SidebarRow({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      className="h-auto min-h-9 w-full justify-start gap-2 whitespace-normal rounded-md px-3 py-2 text-left"
      onClick={onClick}
    >
      {icon}
      <span className="flex-1 truncate text-left">{label}</span>
      {typeof badge === "number" && badge > 0 ? (
        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Button>
  );
}

function entryActive(entry: SidebarEntry, view: string, pathname: string): boolean {
  if (entry.kind === "view") {
    return pathname.startsWith("/dashboard") && entry.key === view;
  }
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}

function navBadge(
  entryKey: string,
  isExpert: boolean,
  counts: DashboardSummaryJson["counts"]
): number | undefined {
  if (entryKey === "sessions") {
    const n = isExpert ? counts.expertNewBookings : counts.upcomingSessions;
    return n > 0 ? n : undefined;
  }
  if (entryKey === "inbox") {
    return counts.unreadMessages > 0 ? counts.unreadMessages : undefined;
  }
  if (entryKey === "requests") {
    return counts.learnerUnseenRequestResponses > 0
      ? counts.learnerUnseenRequestResponses
      : undefined;
  }
  if (entryKey === "community-requests") {
    return counts.expertCommunityRequests > 0 ? counts.expertCommunityRequests : undefined;
  }
  return undefined;
}

export function DashboardSidebar({
  summary,
  entries,
  view,
  pathname,
  onGo,
}: {
  summary: DashboardSummaryJson;
  entries: SidebarEntry[];
  view: string;
  pathname: string;
  onGo: (entry: SidebarEntry) => void;
}) {
  const { profile, expert, ratings } = summary;
  const isExpert = profile.hasExpertProfile;
  const displayName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || "Member";

  const userRating = isExpert ? ratings.asExpertAvg : ratings.asLearnerAvg;
  const ratingLabel =
    userRating != null ? `${userRating.toFixed(1)} / 5` : "—";
  const sessionsComplete = isExpert
    ? String(expert?.completeSessions ?? 0)
    : String(profile.sessionsCompleted);
  const dependability = isExpert
    ? expert?.expertDependabilityRating
    : profile.learnerDependabilityRating;
  const dependLabel = dependability != null ? String(dependability) : "—";

  return (
    <aside className="w-full shrink-0 lg:w-72">
      <div className="rounded-xl border-2 border-[#003049]/10 bg-white p-4 shadow-sm">
        <div className="flex gap-3">
          <div className="relative shrink-0">
            <Avatar className="h-14 w-14 border-2 border-[#003049]/15">
              <AvatarImage src={profile.profilePhoto ?? undefined} alt="" />
              <AvatarFallback className="bg-[#F77F00] text-white">
                <User className="h-6 w-6" />
              </AvatarFallback>
            </Avatar>
            {profile.online ? (
              <span
                className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500"
                title="Online now"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[#003049]">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
            {profile.online ? (
              <p className="mt-1 text-xs font-medium text-emerald-600">Online now</p>
            ) : null}
          </div>
        </div>

        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">User rating</dt>
            <dd className="font-medium text-foreground">{ratingLabel}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Sessions complete</dt>
            <dd className="font-medium text-foreground">{sessionsComplete}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Dependability</dt>
            <dd className="font-medium text-foreground">{dependLabel}</dd>
          </div>
        </dl>

        <div className="my-4 h-px bg-border" />

        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Navigation
        </div>
        <div className="space-y-1">
          {entries.map((item) => (
            <div key={item.key}>
              {isExpert && item.key === "link-expert-status" ? (
                <div className="mb-2 mt-3 h-px bg-border" />
              ) : null}
              <SidebarRow
                active={entryActive(item, view, pathname)}
                icon={item.icon}
                label={item.label}
                badge={navBadge(item.key, isExpert, summary.counts)}
                onClick={() => onGo(item)}
              />
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
