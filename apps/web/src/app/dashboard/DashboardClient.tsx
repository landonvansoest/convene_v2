"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  Mail,
  Sparkles,
  User,
  LayoutDashboard,
  ClipboardList,
  DollarSign,
  SlidersHorizontal,
  BadgeCheck,
} from "lucide-react";
import { DashboardOverview, type DashboardSummaryJson } from "./DashboardOverview";
import { DashboardSidebar, type SidebarEntry } from "./DashboardSidebar";

import RequestsSection from "../requests/page";
import ProfileSection from "../profile/page";
import DashboardBookedSessionsView from "./views/DashboardBookedSessionsView";
import DashboardInboxView from "./views/DashboardInboxView";
import DashboardCommunityRequestsView from "./views/DashboardCommunityRequestsView";

type MeProfileResponse = {
  user?: unknown | null;
  profile?: { has_expert_profile?: boolean | null } | null;
  error?: unknown;
};

export default function DashboardClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const view = viewParam ?? "overview";

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [hasExpertProfile, setHasExpertProfile] = useState(false);
  const [summary, setSummary] = useState<DashboardSummaryJson | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSignedIn(null);
      setHasExpertProfile(false);
      setSummary(null);
      setSummaryError(null);
      try {
        const res = await fetch("/api/me");
        if (!res.ok) {
          if (!cancelled) setSignedIn(false);
          return;
        }
        const data = (await res.json()) as MeProfileResponse;
        if (cancelled) return;
        setSignedIn(Boolean(data.user));
        setHasExpertProfile(Boolean(data.profile?.has_expert_profile));
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/dashboard-summary");
        const data = (await res.json()) as DashboardSummaryJson & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setSummaryError(typeof data.error === "string" ? data.error : "Failed to load dashboard");
          setSummary(null);
          return;
        }
        setSummaryError(null);
        setSummary(data as DashboardSummaryJson);
        setHasExpertProfile(Boolean(data.profile?.hasExpertProfile));
      } catch {
        if (!cancelled) {
          setSummaryError("Failed to load dashboard");
          setSummary(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const sidebar = useMemo((): SidebarEntry[] => {
    const baseCommon: SidebarEntry[] = [
      { kind: "view", key: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
      { kind: "view", key: "sessions", label: "Booked Sessions", icon: <Calendar className="h-4 w-4 shrink-0" /> },
      { kind: "view", key: "inbox", label: "Inbox", icon: <Mail className="h-4 w-4 shrink-0" /> },
      { kind: "view", key: "requests", label: "Your Requests", icon: <ClipboardList className="h-4 w-4 shrink-0" /> },
      {
        kind: "link",
        key: "link-transactions",
        href: "/account",
        label: "Transactions",
        icon: <DollarSign className="h-4 w-4 shrink-0" />,
      },
      { kind: "view", key: "settings", label: "Profile Settings", icon: <User className="h-4 w-4 shrink-0" /> },
    ];

    const baseExpert: SidebarEntry[] = [
      { kind: "view", key: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
      { kind: "view", key: "sessions", label: "Booked Sessions", icon: <Calendar className="h-4 w-4 shrink-0" /> },
      { kind: "view", key: "inbox", label: "Inbox", icon: <Mail className="h-4 w-4 shrink-0" /> },
      { kind: "view", key: "community-requests", label: "Community Requests", icon: <Sparkles className="h-4 w-4 shrink-0" /> },
      {
        kind: "link",
        key: "link-availability",
        href: "/expert/availability",
        label: "Availability Calendar",
        icon: <Calendar className="h-4 w-4 shrink-0" />,
      },
      {
        kind: "link",
        key: "link-expert-status",
        href: "/subscribe",
        label: "Expert Status",
        icon: <BadgeCheck className="h-4 w-4 shrink-0" />,
      },
      {
        kind: "link",
        key: "link-booking-prefs",
        href: "/expert/packages",
        label: "Booking Preferences",
        icon: <SlidersHorizontal className="h-4 w-4 shrink-0" />,
      },
      {
        kind: "link",
        key: "link-earnings",
        href: "/account",
        label: "Earnings",
        icon: <DollarSign className="h-4 w-4 shrink-0" />,
      },
      {
        kind: "link",
        key: "link-expert-profile",
        href: "/profile",
        label: "Expert Profile",
        icon: <User className="h-4 w-4 shrink-0" />,
      },
    ];

    return hasExpertProfile ? baseExpert : baseCommon;
  }, [hasExpertProfile]);

  function goToEntry(entry: SidebarEntry) {
    if (entry.kind === "link") {
      router.push(entry.href);
      return;
    }
    router.push(`/dashboard?view=${encodeURIComponent(entry.key)}`);
  }

  if (signedIn === null) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10 text-foreground">
        <p className="mx-auto max-w-xl text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10 text-foreground">
        <div className="mx-auto max-w-xl rounded-xl border bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-[#003049]">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please sign in to access your dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (summaryError || !summary) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10 text-foreground">
        <div className="mx-auto max-w-xl rounded-xl border bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-[#003049]">Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">{summaryError ?? "Loading your dashboard…"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-start">
        <DashboardSidebar
          summary={summary}
          entries={sidebar}
          view={view}
          pathname={pathname}
          onGo={goToEntry}
        />

        <main className="min-w-0 flex-1">
          {view === "overview" ? (
            <div className="rounded-xl border-2 border-[#003049]/10 bg-white p-6 shadow-sm">
              <DashboardOverview summary={summary} />
            </div>
          ) : null}

          {view === "sessions" ? <DashboardBookedSessionsView /> : null}
          {view === "inbox" ? <DashboardInboxView /> : null}
          {view === "requests" ? <RequestsSection /> : null}
          {view === "settings" ? <ProfileSection /> : null}

          {view === "community-requests" ? (
            <DashboardCommunityRequestsView categoryId={summary.expert?.categoryId ?? null} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
