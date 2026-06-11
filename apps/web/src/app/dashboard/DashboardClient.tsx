"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  learnerTourStorageKeyForUser,
  useLearnerDashboardTour,
} from "@/components/tour/learner-dashboard-tour-context";
import {
  expertTourStorageKeyForUser,
  useExpertDashboardTour,
} from "@/components/tour/expert-dashboard-tour-context";
import { EXPERT_BIBLE_TOUR_VIEWS } from "@/components/tour/expert-bible-tour";
import { buildLearnerTourDemoSession } from "@/lib/tour/learner-tour-demo-booking";
import { buildExpertTourDemoSession } from "@/lib/tour/expert-tour-demo-booking";
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
import { DashboardSkeleton } from "./DashboardSkeleton";
import type { DashboardBootstrap } from "@/lib/dashboard/load-dashboard-bootstrap";
import {
  HEADER_BADGES_MAY_HAVE_CHANGED,
  INBOX_UNREAD_MAY_HAVE_CHANGED,
} from "@/lib/messages/inbox-unread-events";

import { RequestsListBody } from "../requests/RequestsListBody";
import { ProfilePageBody } from "../profile/ProfilePageBody";
import DashboardBookedSessionsView from "./views/DashboardBookedSessionsView";
import DashboardInboxView from "./views/DashboardInboxView";
import DashboardCommunityRequestsView from "./views/DashboardCommunityRequestsView";
import DashboardTransactionsView from "./views/DashboardTransactionsView";
import DashboardExpertAvailabilityView from "./views/DashboardExpertAvailabilityView";
import DashboardExpertStatusView from "./views/DashboardExpertStatusView";
import DashboardBookingPreferencesView from "./views/DashboardBookingPreferencesView";
import { RegistrationSuccessOverlay } from "@/components/auth/RegistrationSuccessOverlay";

type Props = {
  bootstrap: DashboardBootstrap;
  initialView: string;
  showRegistrationSuccess: boolean;
  showExpertRegistrationSuccess: boolean;
};

export default function DashboardClient({
  bootstrap,
  initialView,
  showRegistrationSuccess: initialRegSuccess,
  showExpertRegistrationSuccess: initialExpertRegSuccess,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState(initialView);
  const [showRegistrationSuccess, setShowRegistrationSuccess] = useState(initialRegSuccess);
  const [showExpertRegistrationSuccess, setShowExpertRegistrationSuccess] =
    useState(initialExpertRegSuccess);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    setShowRegistrationSuccess(initialRegSuccess);
    setShowExpertRegistrationSuccess(initialExpertRegSuccess);
  }, [initialRegSuccess, initialExpertRegSuccess]);

  /** Safety net: welcome DM (also runs in loadMeSession + inbox before first fetch). */
  useEffect(() => {
    if (bootstrap.kind !== "authed") return;
    void fetch("/api/me/ensure-welcome-inbox", { method: "POST", credentials: "include" }).catch(() => {
      /* non-fatal */
    });
  }, [bootstrap.kind]);

  const dismissRegistrationSuccess = useCallback(() => {
    setShowRegistrationSuccess(false);
    const p = new URLSearchParams();
    if (view !== "overview") p.set("view", view);
    if (showExpertRegistrationSuccess) p.set("expertRegistrationComplete", "1");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, view, showExpertRegistrationSuccess]);

  const dismissExpertRegistrationSuccess = useCallback(() => {
    setShowExpertRegistrationSuccess(false);
    const p = new URLSearchParams();
    if (view !== "overview") p.set("view", view);
    if (showRegistrationSuccess) p.set("registrationComplete", "1");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, view, showRegistrationSuccess]);

  const meUserId = bootstrap.kind === "authed" ? bootstrap.user.id : null;

  const markLearnerTourSkipped = useCallback(() => {
    if (!meUserId) return;
    try {
      localStorage.setItem(learnerTourStorageKeyForUser(meUserId), "1");
    } catch {
      /* ignore */
    }
  }, [meUserId]);

  const markExpertTourSkipped = useCallback(() => {
    if (!meUserId) return;
    try {
      localStorage.setItem(expertTourStorageKeyForUser(meUserId), "1");
    } catch {
      /* ignore */
    }
  }, [meUserId]);

  const [meError] = useState<string | null>(() =>
    bootstrap.kind === "authed" ? bootstrap.meError : null,
  );
  const [hasExpertProfile, setHasExpertProfile] = useState(() =>
    bootstrap.kind === "authed" ? Boolean(bootstrap.profile?.has_expert_profile) : false,
  );
  const [roleMode, setRoleMode] = useState<"learner" | "expert">(() =>
    bootstrap.kind === "authed" && bootstrap.profile?.convene_role_mode === "expert"
      ? "expert"
      : "learner",
  );
  const { active: tourActive, stepIndex: tourStep, startTour, dismissTour } = useLearnerDashboardTour();
  const {
    active: expertTourActive,
    stepIndex: expertTourStep,
    startTour: startExpertTour,
    dismissTour: dismissExpertTour,
  } = useExpertDashboardTour();
  const [summary, setSummary] = useState<DashboardSummaryJson | null>(() =>
    bootstrap.kind === "authed" ? bootstrap.summary : null,
  );
  const [summaryError, setSummaryError] = useState<string | null>(() =>
    bootstrap.kind === "authed" ? bootstrap.summaryError : null,
  );

  const refreshSummary = useCallback(() => {
    void (async () => {
      try {
        const res = await fetch("/api/me/dashboard-summary", { cache: "no-store" });
        const data = (await res.json()) as DashboardSummaryJson & { error?: string };
        if (!res.ok || typeof data.error === "string") return;
        setSummaryError(null);
        setSummary(data as DashboardSummaryJson);
        setHasExpertProfile(Boolean(data.profile?.hasExpertProfile));
        const mode = data.profile?.conveneRoleMode;
        if (mode === "expert" || mode === "learner") {
          setRoleMode(mode);
        }
      } catch {
        /* keep existing summary */
      }
    })();
  }, []);

  useEffect(() => {
    if (bootstrap.kind !== "authed") return;
    if (bootstrap.summary !== null) return;
    if (!bootstrap.summaryError) return;

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
        const mode = data.profile?.conveneRoleMode;
        if (mode === "expert" || mode === "learner") {
          setRoleMode(mode);
        }
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
  }, [bootstrap]);

  /**
   * Events (local actions) + polling + refocus — matches `SiteHeader` badge refresh so sidebar
   * counts update when messages/bookings arrive without a full navigation.
   */
  useEffect(() => {
    if (bootstrap.kind !== "authed") return;
    const run = () => {
      if (document.visibilityState !== "visible") return;
      refreshSummary();
    };
    window.addEventListener(INBOX_UNREAD_MAY_HAVE_CHANGED, refreshSummary);
    window.addEventListener(HEADER_BADGES_MAY_HAVE_CHANGED, refreshSummary);
    document.addEventListener("visibilitychange", run);
    const intervalMs = 60_000;
    const id = window.setInterval(run, intervalMs);
    return () => {
      window.removeEventListener(INBOX_UNREAD_MAY_HAVE_CHANGED, refreshSummary);
      window.removeEventListener(HEADER_BADGES_MAY_HAVE_CHANGED, refreshSummary);
      document.removeEventListener("visibilitychange", run);
      window.clearInterval(id);
    };
  }, [bootstrap.kind, refreshSummary]);

  useEffect(() => {
    if (!tourActive) return;
    if (!pathname.startsWith("/dashboard")) return;
    const views = ["overview", "sessions", "inbox", "requests", "overview"] as const;
    const want = views[Math.min(tourStep, views.length - 1)] ?? "overview";
    if (view !== want) {
      setView(want);
      router.replace(`/dashboard?view=${encodeURIComponent(want)}`);
    }
  }, [tourActive, tourStep, pathname, router, view]);

  useEffect(() => {
    if (tourActive && roleMode === "expert") dismissTour();
  }, [tourActive, roleMode, dismissTour]);

  useEffect(() => {
    if (expertTourActive && tourActive) dismissTour();
  }, [expertTourActive, tourActive, dismissTour]);

  useEffect(() => {
    if (expertTourActive && roleMode !== "expert") dismissExpertTour();
  }, [expertTourActive, roleMode, dismissExpertTour]);

  const tourDemoSession = useMemo(() => {
    if (!tourActive || tourStep !== 1 || !meUserId) return null;
    if (roleMode !== "learner") return null;
    return buildLearnerTourDemoSession(meUserId);
  }, [tourActive, tourStep, roleMode, meUserId]);

  const expertTourDemoSession = useMemo(() => {
    if (!expertTourActive || roleMode !== "expert" || !meUserId) return null;
    if (expertTourStep < 1 || expertTourStep > 2) return null;
    return buildExpertTourDemoSession(meUserId);
  }, [expertTourActive, expertTourStep, roleMode, meUserId]);

  const expertTourInboxDemo = useMemo(() => {
    if (!expertTourActive || roleMode !== "expert") return null;
    if (expertTourStep === 3) return { active: true, highlightSuggest: false };
    if (expertTourStep === 4) return { active: true, highlightSuggest: true };
    return null;
  }, [expertTourActive, expertTourStep, roleMode]);

  const registrationTakeTour = useCallback(() => {
    startTour(meUserId);
  }, [startTour, meUserId]);

  const expertRegistrationTakeTour = useCallback(() => {
    startExpertTour(meUserId);
  }, [startExpertTour, meUserId]);

  useEffect(() => {
    if (!expertTourActive) return;
    if (!pathname.startsWith("/dashboard")) return;
    if (roleMode !== "expert") return;
    const want =
      EXPERT_BIBLE_TOUR_VIEWS[Math.min(expertTourStep, EXPERT_BIBLE_TOUR_VIEWS.length - 1)] ?? "overview";
    if (view !== want) {
      setView(want);
      router.replace(`/dashboard?view=${encodeURIComponent(want)}`);
    }
  }, [expertTourActive, expertTourStep, pathname, router, roleMode, view]);

  useEffect(() => {
    if (tourActive) return;
    if (showRegistrationSuccess) return;
    if (showExpertRegistrationSuccess) return;
    if (bootstrap.kind !== "authed" || !meUserId) return;
    if (roleMode !== "learner") return;
    try {
      const key = learnerTourStorageKeyForUser(meUserId);
      const seen = localStorage.getItem(key) === "1";
      if (!seen) startTour(meUserId);
    } catch {
      startTour(meUserId);
    }
  }, [
    tourActive,
    showRegistrationSuccess,
    showExpertRegistrationSuccess,
    bootstrap.kind,
    meUserId,
    roleMode,
    startTour,
  ]);

  const sidebar = useMemo((): SidebarEntry[] => {
    const baseCommon: SidebarEntry[] = [
      { kind: "view", key: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
      { kind: "view", key: "sessions", label: "Booked Sessions", icon: <Calendar className="h-4 w-4 shrink-0" /> },
      { kind: "view", key: "inbox", label: "Inbox", icon: <Mail className="h-4 w-4 shrink-0" /> },
      { kind: "view", key: "requests", label: "Your Requests", icon: <ClipboardList className="h-4 w-4 shrink-0" /> },
      {
        kind: "view",
        key: "transactions",
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
        kind: "view",
        key: "availability",
        label: "Availability Calendar",
        icon: <Calendar className="h-4 w-4 shrink-0" />,
      },
      {
        kind: "view",
        key: "expert-status",
        label: "Expert Status",
        icon: <BadgeCheck className="h-4 w-4 shrink-0" />,
      },
      {
        kind: "view",
        key: "booking-prefs",
        label: "Booking Preferences",
        icon: <SlidersHorizontal className="h-4 w-4 shrink-0" />,
      },
      {
        kind: "view",
        key: "earnings",
        label: "Earnings",
        icon: <DollarSign className="h-4 w-4 shrink-0" />,
      },
      {
        kind: "view",
        key: "expert-profile",
        label: "Expert Profile",
        icon: <User className="h-4 w-4 shrink-0" />,
      },
    ];

    return hasExpertProfile && roleMode === "expert" ? baseExpert : baseCommon;
  }, [hasExpertProfile, roleMode]);

  function goToEntry(entry: SidebarEntry) {
    if (entry.kind === "link") {
      router.push(entry.href);
      return;
    }
    setView(entry.key);
    router.push(`/dashboard?view=${encodeURIComponent(entry.key)}`);
  }

  if (bootstrap.kind === "guest") {
    return (
      <div className="min-h-screen bg-gray-50 px-3 py-10 text-foreground">
        <div className="mx-auto max-w-xl rounded-xl border bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-[#003049]">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please sign in to access your dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (meError) {
    return (
      <div className="min-h-screen bg-gray-50 px-3 py-10 text-foreground">
        <div className="mx-auto max-w-xl rounded-xl border bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-[#003049]">Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">{meError}</p>
        </div>
      </div>
    );
  }

  if (summaryError || !summary) {
    const overlays = (
      <>
        {showRegistrationSuccess ? (
          <RegistrationSuccessOverlay
            open
            variant="learner"
            onDismiss={dismissRegistrationSuccess}
            onSkipWithoutTour={markLearnerTourSkipped}
            onTakeTour={registrationTakeTour}
          />
        ) : null}
        {showExpertRegistrationSuccess ? (
          <RegistrationSuccessOverlay
            open
            variant="expert"
            onDismiss={dismissExpertRegistrationSuccess}
            onSkipWithoutTour={markExpertTourSkipped}
            onTakeTour={() => {
              if (tourActive) dismissTour();
              expertRegistrationTakeTour();
            }}
          />
        ) : null}
      </>
    );

    return (
      <>
        {overlays}
        <DashboardSkeleton
          statusMessage={
            summaryError ??
            (bootstrap.summaryError ? undefined : "Loading your dashboard…")
          }
        />
      </>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] w-full min-w-0 flex-col">
      {showRegistrationSuccess ? (
        <RegistrationSuccessOverlay
          open
          variant="learner"
          onDismiss={dismissRegistrationSuccess}
          onSkipWithoutTour={markLearnerTourSkipped}
          onTakeTour={registrationTakeTour}
        />
      ) : null}
      {showExpertRegistrationSuccess ? (
        <RegistrationSuccessOverlay
          open
          variant="expert"
          onDismiss={dismissExpertRegistrationSuccess}
          onSkipWithoutTour={markExpertTourSkipped}
          onTakeTour={() => {
            if (tourActive) dismissTour();
            expertRegistrationTakeTour();
          }}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-row bg-[#F3F4F6] text-foreground">
        <DashboardSidebar
          summary={summary}
          entries={sidebar}
          view={view}
          pathname={pathname}
          onGo={goToEntry}
        />

        <main className="min-w-0 flex-1 overflow-x-auto px-3 py-6 sm:px-4 lg:px-6 lg:py-8">
          <div className="w-full max-w-none">
            {view === "overview" ? <DashboardOverview summary={summary} /> : null}

            {view === "sessions" ? (
              <DashboardBookedSessionsView tourDemoSession={tourDemoSession ?? expertTourDemoSession} />
            ) : null}
            {view === "inbox" ? <DashboardInboxView tourDemo={expertTourInboxDemo} /> : null}
            {view === "requests" ? <RequestsListBody variant="dashboard" /> : null}
            {view === "transactions" ? <DashboardTransactionsView /> : null}
            {view === "settings" ? <ProfilePageBody variant="dashboard" dashboardMode="learner" /> : null}

            {view === "community-requests" ? (
              <DashboardCommunityRequestsView categoryId={summary.expert?.categoryId ?? null} />
            ) : null}
            {view === "availability" ? <DashboardExpertAvailabilityView /> : null}
            {view === "expert-status" ? <DashboardExpertStatusView /> : null}
            {view === "booking-prefs" ? <DashboardBookingPreferencesView /> : null}
            {view === "earnings" ? <DashboardTransactionsView mode="expert" /> : null}
            {view === "expert-profile" ? <ProfilePageBody variant="dashboard" dashboardMode="expert" /> : null}
          </div>
        </main>
      </div>
    </div>
  );
}
