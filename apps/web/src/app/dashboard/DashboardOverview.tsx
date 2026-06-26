"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, ClipboardList, DollarSign, LayoutDashboard, Mail, MessageSquare, TrendingUp } from "lucide-react";
import { VisibleTempDot } from "@/components/presence/VisibleTempDot";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DashboardViewHeader,
  dashboardViewContentBoxClass,
} from "@/app/dashboard/DashboardViewShell";

export type DashboardSummaryJson = {
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    profilePhoto: string | null;
    online: boolean;
    /** Expert calendar: bookable within the next hour (self only — shown on dashboard sidebar). */
    availableNow?: boolean;
    sessionsBooked: number;
    sessionsCompleted: number;
    learnerDependabilityRating: number | null;
    hasExpertProfile: boolean;
    conveneRoleMode?: "learner" | "expert";
  };
  expert: {
    expertProfileId: string;
    completeSessions: number;
    expertDependabilityRating: number | null;
    categoryId: string | null;
    expertVisibilityState: string | null;
  } | null;
  ratings: {
    asLearnerAvg: number | null;
    asExpertAvg: number | null;
  };
  counts: {
    upcomingSessions: number;
    unreadMessages: number;
    /** Expert: `awaiting_expert` booking requests needing approve/decline. */
    expertBookingRequests: number;
    expertNewBookings: number;
    /** Learner: instant-book rows awaiting card payment (`pending`), not ended. Used by header badge. */
    learnerUnpaidCardBookings: number;
    learnerUnseenRequestResponses: number;
    expertCommunityRequests: number;
  };
  earningsThisMonth: number;
  actionItems: Array<{ id: string; label: string; href: string }>;
  /** Paid sessions on today’s calendar (local wall clock), not yet ended. */
  sessionsTodayPreview?: {
    nextStartsInMinutes: number | null;
    /** Wall-clock start instant for the next session (so the UI can count down client-side). */
    nextSessionStartsAtMs?: number | null;
    /** The other participant for the soonest upcoming session today (when countdown is shown). */
    nextSession?: {
      bookingId: string;
      partnerName: string;
      partnerPhoto: string | null;
      partnerExpertVisibilityState?: string | null;
      startTimeLabel: string;
    } | null;
    /** Today's paid sessions (chronological), for overview rows with partner metadata. */
    todayPaidSessionRows?: Array<{
      bookingId: string;
      partnerName: string;
      partnerPhoto: string | null;
      partnerExpertVisibilityState?: string | null;
      startTimeLabel: string;
      rangeLabel: string;
    }>;
  } | null;
  /** Upcoming booked sessions (chronological) for Action Items list. */
  upcomingSessionPreview?: Array<{
    bookingId: string;
    partnerName: string;
    partnerPhoto: string | null;
    partnerExpertVisibilityState?: string | null;
    startTimeLabel: string;
    /** Drives the Action Items row type label in the overview list. */
    listType?: "booking" | "request" | "payment";
  }>;
  /** Unread messages (one row each) for Action Items list. */
  unreadInboxPreview?: Array<{
    messageId: string;
    partnerId: string;
    senderName: string;
    senderPhoto: string | null;
    partnerExpertVisibilityState?: string | null;
    subject: string;
    preview: string;
  }>;
};

type OverviewListRow =
  | {
      kind: "session";
      typeLabel: string;
      id: string;
      href: string;
      partnerName: string;
      partnerPhoto: string | null;
      partnerExpertVisibilityState?: string | null;
      startTimeLabel: string;
    }
  | {
      kind: "inbox";
      typeLabel: string;
      id: string;
      href: string;
      senderName: string;
      senderPhoto: string | null;
      partnerExpertVisibilityState?: string | null;
      subject: string;
      preview: string;
    };

function sessionPreviewTypeLabel(listType?: "booking" | "request" | "payment"): string {
  switch (listType) {
    case "request":
      return "Request";
    case "payment":
      return "Payment";
    default:
      return "Booking";
  }
}

function overviewRowTypeCell(label: string) {
  return (
    <span className="w-[4.75rem] shrink-0 text-xs font-semibold text-[#003049]/55">
      {label}
    </span>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  onClick,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-stretch rounded-lg border-2 border-[#003049]/10 bg-white p-4 text-left shadow-sm transition hover:border-[#003049]/25 focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#F77F00]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#003049]/55">{title}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F77F00]/12 text-[#F77F00] [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </span>
      </div>
      <span className="mt-3 text-2xl font-semibold tabular-nums text-[#003049]">{value}</span>
      <span className="mt-1 text-xs font-medium text-[#003049]/60">{subtitle}</span>
    </button>
  );
}

function useLiveMinutesUntilStart(
  startsAtMs: number | null | undefined,
  fallbackMinutes: number | null | undefined,
): { minutes: number | null; phase: "upcoming" | "now" } {
  const [tick, setTick] = useState(0);
  const startMs = typeof startsAtMs === "number" && Number.isFinite(startsAtMs) ? startsAtMs : null;

  useEffect(() => {
    if (startMs == null) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    const onVis = () => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [startMs]);

  return useMemo(() => {
    void tick;
    if (startMs != null) {
      const diff = startMs - Date.now();
      if (diff <= 0) return { minutes: null, phase: "now" as const };
      return {
        minutes: Math.max(0, Math.ceil(diff / 60_000)),
        phase: "upcoming" as const,
      };
    }
    if (fallbackMinutes == null) return { minutes: null, phase: "upcoming" as const };
    return { minutes: fallbackMinutes, phase: "upcoming" as const };
  }, [startMs, fallbackMinutes, tick]); // tick forces recalc on interval
}

function greetingFirstName(profile: DashboardSummaryJson["profile"]): string {
  const n = profile.firstName?.trim();
  if (n) return n;
  const email = profile.email?.trim();
  if (email?.includes("@")) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return "";
}

function initialsFromDisplayName(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "—"
  );
}

export function DashboardOverview({ summary }: { summary: DashboardSummaryJson }) {
  const router = useRouter();
  const {
    profile,
    counts,
    earningsThisMonth,
    actionItems,
    sessionsTodayPreview: sessionsTodayPreviewRaw,
    upcomingSessionPreview = [],
    unreadInboxPreview = [],
  } = summary;
  const sessionsTodayPreview = sessionsTodayPreviewRaw ?? null;
  const isExpert = profile.hasExpertProfile;
  const greet = greetingFirstName(profile);
  const { minutes: liveNextMinutes, phase: nextSessionPhase } = useLiveMinutesUntilStart(
    sessionsTodayPreview?.nextSessionStartsAtMs,
    sessionsTodayPreview?.nextStartsInMinutes,
  );

  const previewHighlight = sessionsTodayPreview;
  const hasSessionsPreviewHighlight = Boolean(
    previewHighlight &&
      (previewHighlight.nextStartsInMinutes !== null ||
        previewHighlight.nextSessionStartsAtMs != null ||
        (previewHighlight.todayPaidSessionRows?.length ?? 0) >= 2 ||
        nextSessionPhase === "now"),
  );

  const showExpertBookingRequestsBadge = isExpert && counts.expertBookingRequests > 0;
  const showExpertBookingsBadge = isExpert && counts.expertNewBookings > 0;
  const expertBookingRequestsItem = actionItems.find((i) => i.id === "expert-booking-requests");
  const learnerPayItem = actionItems.find((i) => i.id === "learner-pay");
  const unpaidTodayItem = actionItems.find((i) => i.id === "today");
  const showLearnerPayBadge = Boolean(learnerPayItem);
  const showUnpaidTodayBadge = Boolean(unpaidTodayItem);

  const showUnreadBadge = counts.unreadMessages > 0;
  const showRequestResponsesBadge =
    !isExpert && counts.learnerUnseenRequestResponses > 0;

  const overviewListRows = useMemo((): OverviewListRow[] => {
    const rows: OverviewListRow[] = [];
    for (const s of upcomingSessionPreview) {
      rows.push({
        kind: "session",
        typeLabel: sessionPreviewTypeLabel(s.listType),
        id: `sess-${s.bookingId}`,
        href: "/dashboard?view=sessions",
        partnerName: s.partnerName,
        partnerPhoto: s.partnerPhoto,
        partnerExpertVisibilityState: s.partnerExpertVisibilityState,
        startTimeLabel: s.startTimeLabel,
      });
    }
    for (const m of unreadInboxPreview) {
      rows.push({
        kind: "inbox",
        typeLabel: "Message",
        id: `msg-${m.messageId}`,
        href: `/messages/${encodeURIComponent(m.partnerId)}`,
        senderName: m.senderName,
        senderPhoto: m.senderPhoto,
        partnerExpertVisibilityState: m.partnerExpertVisibilityState,
        subject: m.subject,
        preview: m.preview,
      });
    }
    return rows;
  }, [upcomingSessionPreview, unreadInboxPreview]);

  const showNextSessionBadge =
    hasSessionsPreviewHighlight &&
    (nextSessionPhase === "now" ||
      liveNextMinutes !== null ||
      sessionsTodayPreview?.nextStartsInMinutes !== null);

  const countdownMinutes =
    nextSessionPhase === "now"
      ? null
      : (liveNextMinutes ?? sessionsTodayPreview?.nextStartsInMinutes ?? null);

  const leftNextSessionAlertText =
    showNextSessionBadge && sessionsTodayPreview ?
      nextSessionPhase === "now" ?
        "Session is live — open Booked sessions to join."
      : countdownMinutes !== null ?
        `Next session in ${countdownMinutes} minute${countdownMinutes === 1 ? "" : "s"}`
      : null
    : null;

  const leftAlertClasses =
    "w-full rounded-lg border border-[#003049] bg-[#003049] px-3 py-2.5 text-left text-sm font-semibold leading-snug text-white transition hover:bg-[#003049]/90 focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#F77F00]";

  const hasPressingBadges =
    Boolean(leftNextSessionAlertText) ||
    showExpertBookingRequestsBadge ||
    showExpertBookingsBadge ||
    showLearnerPayBadge ||
    showUnpaidTodayBadge ||
    showUnreadBadge ||
    showRequestResponsesBadge;
  const hasRightColumnContent = overviewListRows.length > 0;
  const hasOverviewContent = hasPressingBadges || hasRightColumnContent;
  const rightColumnScrollable = overviewListRows.length >= 5;

  return (
    <div className="space-y-6">
      <DashboardViewHeader
        Icon={LayoutDashboard}
        title={`Welcome back${greet ? `, ${greet}` : ""}`}
      />

      <div
        className={
          isExpert
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            : "grid grid-cols-1 gap-3 sm:grid-cols-3"
        }
      >
        <StatCard
          title="Upcoming Sessions"
          value={String(counts.upcomingSessions)}
          subtitle="This week"
          onClick={() => router.push("/dashboard?view=sessions")}
          icon={<Calendar className="h-4 w-4" />}
        />
        <StatCard
          title="Unread Messages"
          value={String(counts.unreadMessages)}
          subtitle="Pending responses"
          onClick={() => router.push("/dashboard?view=inbox")}
          icon={<Mail className="h-4 w-4" />}
        />
        {isExpert ? (
          <StatCard
            title="Community requests"
            value={String(counts.expertCommunityRequests)}
            subtitle="In your category (not archived)"
            onClick={() => router.push("/dashboard?view=community-requests")}
            icon={<MessageSquare className="h-4 w-4" />}
          />
        ) : (
          <StatCard
            title="This Month"
            value={
              profile.sessionsCompleted > 0
                ? `${profile.sessionsCompleted} session${profile.sessionsCompleted === 1 ? "" : "s"}`
                : "—"
            }
            subtitle="Total completed"
            onClick={() => router.push("/dashboard?view=sessions")}
            icon={<TrendingUp className="h-4 w-4" />}
          />
        )}
        {isExpert ? (
          <StatCard
            title="Total earnings"
            value={new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(earningsThisMonth)}
            subtitle="This month"
            onClick={() => router.push("/account")}
            icon={<DollarSign className="h-4 w-4" />}
          />
        ) : null}
      </div>

      <div className={dashboardViewContentBoxClass}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#F77F00] text-white shadow-sm">
            <ClipboardList className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-[#003049]">Action Items</h2>
            <p className="mt-0.5 text-sm font-medium text-[#003049]/65">Tasks that need your attention</p>
          </div>
        </div>

        {!hasOverviewContent ? (
          <div className="mt-5 py-4 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-[#003049]/25" strokeWidth={1.5} aria-hidden />
            <p className="mt-2 text-sm font-medium text-[#003049]/65">You&apos;re all caught up.</p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
            {hasPressingBadges ? (
            <div className="flex min-h-0 flex-col gap-3">
              {leftNextSessionAlertText ? (
                <button
                  type="button"
                  onClick={() => router.push("/dashboard?view=sessions")}
                  className={leftAlertClasses}
                >
                  {leftNextSessionAlertText}
                </button>
              ) : null}

              {showUnpaidTodayBadge ? (
                <button
                  type="button"
                  onClick={() => router.push("/dashboard?view=sessions")}
                  className={leftAlertClasses}
                >
                  {unpaidTodayItem?.label ?? "Sessions today need payment before they're confirmed."}
                </button>
              ) : null}

              {showExpertBookingRequestsBadge ? (
                <button
                  type="button"
                  onClick={() => router.push("/dashboard?view=sessions")}
                  className={leftAlertClasses}
                >
                  {expertBookingRequestsItem?.label ??
                    (counts.expertBookingRequests === 1
                      ? "You have a new booking request."
                      : `You have ${counts.expertBookingRequests} new booking requests.`)}
                </button>
              ) : null}

              {showExpertBookingsBadge ? (
                <button
                  type="button"
                  onClick={() => router.push("/dashboard?view=sessions")}
                  className={leftAlertClasses}
                >
                  {counts.expertNewBookings === 1
                    ? "1 booking needs payment confirmation"
                    : `${counts.expertNewBookings} bookings need payment confirmation`}
                </button>
              ) : null}

              {showLearnerPayBadge && learnerPayItem ? (
                <button
                  type="button"
                  onClick={() => router.push("/dashboard?view=sessions")}
                  className={leftAlertClasses}
                >
                  {learnerPayItem.label}
                </button>
              ) : null}

              {showUnreadBadge ? (
                <button
                  type="button"
                  onClick={() => router.push("/dashboard?view=inbox")}
                  className={leftAlertClasses}
                >
                  {counts.unreadMessages === 1
                    ? "1 unread message"
                    : `${counts.unreadMessages} unread messages`}
                </button>
              ) : null}

              {showRequestResponsesBadge ? (
                <button
                  type="button"
                  onClick={() => router.push("/dashboard?view=requests")}
                  className={leftAlertClasses}
                >
                  {counts.learnerUnseenRequestResponses === 1
                    ? "1 new expert response to your request."
                    : `${counts.learnerUnseenRequestResponses} new expert responses to your requests.`}
                </button>
              ) : null}
            </div>
            ) : null}

            {hasRightColumnContent ? (
            <div
              className={
                hasPressingBadges ? "min-w-0 lg:col-span-2" : "min-w-0 lg:col-span-3"
              }
            >
                  <ul
                    className={
                      rightColumnScrollable
                        ? "max-h-[17.5rem] space-y-2 overflow-y-auto overscroll-contain pr-0.5"
                        : "space-y-2"
                    }
                  >
                    {overviewListRows.map((row) => (
                      <li key={row.id}>
                        {row.kind === "session" ?
                          <Link
                            href={row.href}
                            className="flex w-full items-center gap-3 rounded-lg border border-[#003049]/10 bg-[#F8FAFC] px-4 py-3 text-left transition hover:border-[#003049]/20 hover:bg-white focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#F77F00]"
                          >
                            {overviewRowTypeCell(row.typeLabel)}
                            <div className="relative h-10 w-10 shrink-0">
                              <Avatar className="h-full w-full border border-[#003049]/10 shadow-sm">
                                <AvatarImage
                                  src={row.partnerPhoto ?? undefined}
                                  alt=""
                                  className="object-cover"
                                />
                                <AvatarFallback className="bg-[#003049]/10 text-xs font-semibold text-[#003049]">
                                  {initialsFromDisplayName(row.partnerName)}
                                </AvatarFallback>
                              </Avatar>
                              <VisibleTempDot expertVisibilityState={row.partnerExpertVisibilityState} />
                            </div>
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#003049]">
                              {row.partnerName}
                            </span>
                            <span className="shrink-0 text-sm tabular-nums font-medium text-[#003049]/70">
                              {row.startTimeLabel}
                            </span>
                          </Link>
                        : <Link
                            href={row.href}
                            className="flex w-full items-center gap-3 rounded-lg border border-[#003049]/10 bg-[#F8FAFC] px-4 py-3 text-left transition hover:border-[#003049]/20 hover:bg-white focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#F77F00]"
                          >
                            {overviewRowTypeCell(row.typeLabel)}
                            <div className="relative h-10 w-10 shrink-0">
                              <Avatar className="h-full w-full border border-[#003049]/10 shadow-sm">
                                <AvatarImage
                                  src={row.senderPhoto ?? undefined}
                                  alt=""
                                  className="object-cover"
                                />
                                <AvatarFallback className="bg-[#003049]/10 text-xs font-semibold text-[#003049]">
                                  {initialsFromDisplayName(row.senderName)}
                                </AvatarFallback>
                              </Avatar>
                              <VisibleTempDot expertVisibilityState={row.partnerExpertVisibilityState} />
                            </div>
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="shrink-0 text-sm font-semibold text-[#003049]">
                                {row.senderName}
                              </span>
                              {row.preview ?
                                <span className="min-w-0 flex-1 truncate text-sm text-[#003049]/60">
                                  {row.preview}
                                </span>
                              : null}
                            </div>
                          </Link>}
                      </li>
                    ))}
                  </ul>
            </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
