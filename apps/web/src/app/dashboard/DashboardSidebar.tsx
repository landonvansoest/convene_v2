"use client";

import type { ReactNode } from "react";
import { CircleCheck, Star, TrendingUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { OnlineDot } from "@/components/presence/OnlineDot";
import { VisibleTempDot } from "@/components/presence/VisibleTempDot";
import { formatDependabilityRating } from "@/lib/formatDependabilityRating";
import { cn } from "@/lib/utils";
import type { DashboardSummaryJson } from "./DashboardOverview";

export type SidebarEntry =
  | { kind: "view"; key: string; label: string; icon: ReactNode }
  | { kind: "link"; key: string; href: string; label: string; icon: ReactNode };

function sidebarDataTourTarget(entry: SidebarEntry): string | undefined {
  if (entry.kind !== "view") return undefined;
  if (entry.key === "overview") return "sidebar-overview";
  if (entry.key === "sessions") return "sidebar-booked-sessions";
  if (entry.key === "inbox") return "sidebar-inbox";
  if (entry.key === "requests") return "sidebar-requests";
  if (entry.key === "community-requests") return "sidebar-community-requests";
  if (entry.key === "availability") return "sidebar-availability";
  return undefined;
}

const EXPERT_SIDEBAR_FOOTER_KEYS = new Set([
  "expert-status",
  "booking-prefs",
  "earnings",
  "expert-profile",
]);

function SidebarRow({
  active,
  icon,
  label,
  badge,
  dataTourTarget,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  badge?: number;
  dataTourTarget?: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      className="h-auto min-h-9 w-full justify-start gap-2 whitespace-normal rounded-md px-3 py-2 text-left"
      data-tour-target={dataTourTarget}
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
  const nameFromParts = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  const emailLocal =
    typeof profile.email === "string" && profile.email.includes("@")
      ? profile.email.split("@")[0]?.trim() || ""
      : "";
  const displayName = nameFromParts || emailLocal || "Member";

  const userRating = isExpert ? ratings.asExpertAvg : ratings.asLearnerAvg;
  const ratingLabel =
    userRating != null ? `${userRating.toFixed(1)} / 5` : "—";
  const rawSessionsComplete = isExpert
    ? Number(expert?.completeSessions ?? 0)
    : Number(profile.sessionsCompleted ?? 0);
  const sessionsComplete = rawSessionsComplete > 0 ? String(rawSessionsComplete) : "—";
  const dependability = isExpert
    ? expert?.expertDependabilityRating
    : profile.learnerDependabilityRating;
  const dependLabel = formatDependabilityRating(dependability);

  const avatarInitials =
    [profile.firstName, profile.lastName]
      .map((s) => s?.trim().slice(0, 1))
      .filter(Boolean)
      .join("")
      .toUpperCase() ||
    emailLocal.slice(0, 2).toUpperCase() ||
    "U";

  const mainNavEntries = isExpert
    ? entries.filter((e) => !EXPERT_SIDEBAR_FOOTER_KEYS.has(e.key))
    : entries;
  const footerNavEntries = isExpert
    ? entries.filter((e) => EXPERT_SIDEBAR_FOOTER_KEYS.has(e.key))
    : [];

  const statRows: Array<{ icon: ReactNode; label: string; value: string }> = [
    {
      icon: <Star className="h-4 w-4 shrink-0 text-[#F77F00]" strokeWidth={2} aria-hidden />,
      label: "User rating",
      value: ratingLabel,
    },
    {
      icon: <CircleCheck className="h-4 w-4 shrink-0 text-[#F77F00]" strokeWidth={2} aria-hidden />,
      label: "Sessions complete",
      value: sessionsComplete,
    },
    {
      icon: <TrendingUp className="h-4 w-4 shrink-0 text-[#F77F00]" strokeWidth={2} aria-hidden />,
      label: "Dependability rating",
      value: dependLabel,
    },
  ];

  return (
    <aside
      className={cn(
        "w-52 shrink-0 self-stretch border-r border-[#003049]/12 bg-white sm:w-60 lg:w-72",
      )}
    >
      <div className="flex flex-col p-4 sm:p-5">
        <div className="flex gap-3">
          <div className="relative shrink-0">
            <Avatar className="h-14 w-14 border-2 border-[#FFF6EE]">
              <AvatarImage src={profile.profilePhoto ?? undefined} alt="" />
              <AvatarFallback className="bg-[#FFF6EE] text-base font-semibold text-[#003049]">
                {avatarInitials.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <OnlineDot online={profile.online} />
            <VisibleTempDot expertVisibilityState={expert?.expertVisibilityState} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-[#003049]">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
            {profile.online ? (
              <p className="mt-1 text-xs font-medium text-convene-hero">Online now</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-[#003049]/10 bg-[#F3F4F6] p-3">
          <dl className="space-y-2.5 text-xs">
            {statRows.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-2">
                <dt className="flex min-w-0 items-start gap-2 text-[#003049]/80">
                  {row.icon}
                  <span className="pt-0.5 font-medium leading-snug">{row.label}</span>
                </dt>
                <dd className="shrink-0 pt-0.5 font-semibold tabular-nums text-[#003049]">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <nav className="mt-5 space-y-0.5">
          {mainNavEntries.map((item, index) => {
            const prev = mainNavEntries[index - 1];
            const showDividerBefore =
              (item.key === "sessions" && prev?.key === "overview") ||
              (item.key === "transactions" && prev?.key === "requests");
            return (
              <div key={item.key}>
                {showDividerBefore ? <div className="my-3 h-px bg-[#003049]/12" aria-hidden /> : null}
                <SidebarRow
                  active={entryActive(item, view, pathname)}
                  icon={item.icon}
                  label={item.label}
                  badge={navBadge(item.key, isExpert, summary.counts)}
                  dataTourTarget={sidebarDataTourTarget(item)}
                  onClick={() => onGo(item)}
                />
              </div>
            );
          })}
          {footerNavEntries.length ? (
            <>
              <div className="my-3 h-px bg-[#003049]/12" aria-hidden />
              <div className="space-y-0.5" data-tour-target="expert-sidebar-footer-links">
                {footerNavEntries.map((item) => (
                  <SidebarRow
                    key={item.key}
                    active={entryActive(item, view, pathname)}
                    icon={item.icon}
                    label={item.label}
                    badge={navBadge(item.key, isExpert, summary.counts)}
                    dataTourTarget={sidebarDataTourTarget(item)}
                    onClick={() => onGo(item)}
                  />
                ))}
              </div>
            </>
          ) : null}
        </nav>
      </div>
    </aside>
  );
}
