"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  Clock,
  ClipboardList,
  Gift,
  Info,
  MessageSquare,
  RefreshCw,
  Star,
  Timer,
  Video,
  Camera,
  Mic,
  Check,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dashboardTabPillClass,
  dashboardViewCardClass,
  dashboardViewContentBoxClass,
  DashboardViewHeader,
} from "@/app/dashboard/DashboardViewShell";
import { MediaDeviceTestDialog } from "@/components/dashboard/MediaDeviceTestDialog";
import { VisibleTempDot } from "@/components/presence/VisibleTempDot";
import { PartnerConversationDialog } from "@/components/dashboard/PartnerConversationDialog";
import { BookingRequestRespondDialog } from "@/components/dashboard/BookingRequestRespondDialog";
import { BookingRequestSetupDialog } from "@/components/dashboard/BookingRequestSetupDialog";
import { SendOfferDialog } from "@/components/dashboard/SendOfferDialog";
import { SessionDependabilityDetailsDialog } from "@/components/dashboard/SessionDependabilityDetailsDialog";
import { SessionManageDialog, type ManagedSessionRow } from "@/components/dashboard/SessionManageDialog";
import { SessionPaymentDialog } from "@/components/dashboard/SessionPaymentDialog";
import { SessionReviewDialog } from "@/components/dashboard/SessionReviewDialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  hasSessionEndedByWallClock,
  isSessionJoinWindowOpen,
  sessionWallClockInstant,
} from "@/lib/sessionWallClock";
import {
  isSessionInactiveForRoleMode,
  switchModeJoinHint,
  type ConveneRoleMode,
} from "@/lib/dashboard/role-mode-session";
import { cn } from "@/lib/utils";
import { isPackageCreditUsable } from "@/lib/packages/learner-package-credits";
import { formatPackageDurationForNotice } from "@/lib/packages/package-deal";
import {
  isAwaitingExpertBookingRequest,
  isBookingRequestAwaitingPaymentMethod,
  isBookingRequestSubmittedToExpert,
} from "@/lib/booking-request";

type SessionRow = ManagedSessionRow & {
  id?: string;
  booking_id?: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  payment_status?: string;
  stripe_payment_method_id?: string | null;
  total_price?: number;
  total_amount?: number;
  partner_name?: string | null;
  partner_photo?: string | null;
  partner_online?: boolean | null;
  partner_expert_visibility_state?: string | null;
  partner_profession?: string | null;
  duration_minutes?: number | null;
  learner_id?: string;
  expert_id?: string;
  user_role?: string;
  cancelled_at?: string | null;
  tour_demo?: boolean;
  tour_partner_profession?: string;
  review_submitted?: boolean;
  pending_reschedule_date?: string | null;
  partner_has_expert_profile?: boolean | null;
};

type PackageCreditRow = {
  credit_id: string;
  package_id: string;
  remaining_credits: number;
  expiration_at: string | null;
  expert_user_id: string | null;
  expert_name: string | null;
  expert_profile_photo: string | null;
  session_count: number | null;
  session_duration_minutes: number | null;
  package_title: string | null;
};

function partnerUserId(s: SessionRow): string | null {
  const role = String(s.user_role ?? "").toLowerCase();
  if (role === "learner") return s.expert_id ? String(s.expert_id) : null;
  if (role === "expert") return s.learner_id ? String(s.learner_id) : null;
  return null;
}

/** Public profile URL for the session partner: expert PDP if they have an expert profile, else learner profile. */
function partnerProfileHref(s: SessionRow): string | null {
  if (s.tour_demo) return null;
  const uid = partnerUserId(s);
  if (!uid) return null;
  const asExpert = Boolean(s.partner_has_expert_profile);
  return asExpert ? `/experts/${encodeURIComponent(uid)}` : `/learner/${encodeURIComponent(uid)}`;
}

/** Calendar column: Month, Day, Year (wall date in UTC components). */
function formatSessionDateCol(sessionDate: string | undefined): string {
  if (!sessionDate) return "—";
  const parts = sessionDate.split("-").map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return sessionDate;
  const [y, mo, da] = parts;
  const d = new Date(Date.UTC(y, mo - 1, da));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function formatTimeRange(sessionDate: string | undefined, startTime: string | undefined, endTime: string | undefined): string {
  const a = sessionWallClockInstant(sessionDate ?? "", startTime);
  const b = sessionWallClockInstant(sessionDate ?? "", endTime);
  if (!a || !b) return "—";
  const o = { hour: "numeric", minute: "2-digit" } as const;
  return `${a.toLocaleTimeString("en-US", o)} - ${b.toLocaleTimeString("en-US", o)}`;
}

function formatDurationLabel(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

type BookingPaymentUi = "paid" | "pending" | "complete" | "refunded" | "failed" | "awaiting_expert";

function bookingPaymentUi(s: SessionRow, tourDemo: boolean): BookingPaymentUi {
  if (tourDemo) return "paid";
  const st = String(s.status ?? "").toLowerCase();
  const ps = String(s.payment_status ?? "").toLowerCase();
  const cancelled = st === "cancelled" || !!s.cancelled_at;
  if (cancelled || ps === "refunded") return "refunded";
  if (ps === "failed") return "failed";
  if (isAwaitingExpertBookingRequest(ps)) return "awaiting_expert";
  const paidOk = ps === "paid" || ps === "succeeded";
  if (st === "complete" && paidOk) return "complete";
  if (paidOk) return "paid";
  return "pending";
}

function bookingPaymentLabel(
  ui: BookingPaymentUi,
  userRole?: string,
  stripePaymentMethodId?: string | null,
): string {
  switch (ui) {
    case "paid":
      return "Paid";
    case "pending":
      return "Pending";
    case "complete":
      return "Complete";
    case "refunded":
      return "Refunded";
    case "failed":
      return "Payment failed";
    case "awaiting_expert":
      return String(userRole ?? "").toLowerCase() === "expert"
        ? "Booking request"
        : String(stripePaymentMethodId ?? "").trim()
          ? "Awaiting approval"
          : "Finish request";
  }
}

const PAYMENT_PILL_CLASS =
  "inline-flex w-fit max-w-full shrink-0 self-start items-center rounded-full bg-[#003049]/14 px-2.5 py-0.5 text-xs font-semibold text-[#003049]";
const PAYMENT_FAILED_PILL_CLASS =
  "inline-flex w-fit max-w-full shrink-0 self-start items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800";

function SessionNoticeIcon({
  ariaLabel,
  title,
  body,
}: {
  ariaLabel: string;
  title: string;
  body: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-full text-[#F77F00] outline-none ring-offset-2 transition hover:text-[#F77F00]/80 focus-visible:ring-2 focus-visible:ring-[#003049]/30"
          aria-label={ariaLabel}
        >
          <AlertTriangle className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[16rem] px-3 py-2 text-left">
        <p className="text-sm font-semibold text-[#003049]">{title}</p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{body}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default function DashboardBookedSessionsView({
  roleMode,
  tourDemoSession = null,
}: {
  roleMode: ConveneRoleMode;
  tourDemoSession?: SessionRow | null;
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [manageSession, setManageSession] = useState<SessionRow | null>(null);
  const [detailsSession, setDetailsSession] = useState<SessionRow | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messagePartnerId, setMessagePartnerId] = useState<string | null>(null);
  const [messagePartnerName, setMessagePartnerName] = useState<string | null>(null);
  const [messagePartnerPhoto, setMessagePartnerPhoto] = useState<string | null>(null);
  const [messagePartnerExpertVisibilityState, setMessagePartnerExpertVisibilityState] = useState<
    string | null
  >(null);
  const [messageTourDemo, setMessageTourDemo] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payBookingId, setPayBookingId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewBookingId, setReviewBookingId] = useState<string | null>(null);
  const [reviewRole, setReviewRole] = useState<"learner" | "expert">("learner");
  const [reviewPartnerName, setReviewPartnerName] = useState<string | null>(null);
  const [mediaTestOpen, setMediaTestOpen] = useState(false);
  const [packageCredits, setPackageCredits] = useState<PackageCreditRow[]>([]);
  const [respondDialog, setRespondDialog] = useState<{
    bookingId: string;
    partnerName: string;
    action: "approve" | "decline";
  } | null>(null);
  const [offerSession, setOfferSession] = useState<SessionRow | null>(null);
  const [setupSession, setSetupSession] = useState<SessionRow | null>(null);

  const refresh = useCallback(async () => {
    setLoadErr(null);
    const fetches: [Promise<Response>, Promise<Response | null>] = [
      fetch("/api/sessions/my-sessions"),
      roleMode === "learner" ? fetch("/api/me/package-credits") : Promise.resolve(null),
    ];
    const [sessionsRes, creditsRes] = await Promise.all(fetches);
    const data = await sessionsRes.json();
    if (!sessionsRes.ok) {
      setLoadErr(typeof data.error === "string" ? data.error : "Failed to load");
      setSessions([]);
    } else {
      setSessions((data.sessions as SessionRow[]) ?? []);
    }

    if (creditsRes) {
      try {
        const creditsData = (await creditsRes.json()) as { credits?: PackageCreditRow[] };
        if (creditsRes.ok) {
          setPackageCredits(creditsData.credits ?? []);
        } else {
          setPackageCredits([]);
        }
      } catch {
        setPackageCredits([]);
      }
    } else {
      setPackageCredits([]);
    }
  }, [roleMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (tourDemoSession) setTab("upcoming");
  }, [tourDemoSession]);

  async function putStatus(
    bookingId: string,
    status: "upcoming" | "live" | "complete" | "cancelled",
    cancellationReason?: string | null
  ) {
    const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        cancellationReason: cancellationReason ?? null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.alert(typeof data.error === "string" ? data.error : "Update failed");
      return;
    }
    await refresh();
  }

  const { upcoming, past } = useMemo(() => {
    const u: SessionRow[] = [];
    const p: SessionRow[] = [];
    for (const s of sessions) {
      const st = String(s.status ?? "").toLowerCase();
      const cancelled = st === "cancelled" || !!s.cancelled_at;
      const ps = String(s.payment_status ?? "").toLowerCase();
      const tourDemo = Boolean(s.tour_demo);
      const endedByWall = hasSessionEndedByWallClock(s.session_date, s.end_time);

      // Only hide abandoned legacy card checkouts (pending + past slot). Keep awaiting_expert / failed / etc. visible.
      if (!tourDemo && endedByWall && ps === "pending") {
        continue;
      }

      if (st === "complete" || cancelled || endedByWall) {
        p.push(s);
      } else if (st === "upcoming" || st === "live") {
        u.push(s);
      } else {
        p.push(s);
      }
    }
    const bySoonest = (a: SessionRow, b: SessionRow) => {
      const da = String(a.session_date ?? "");
      const db = String(b.session_date ?? "");
      if (da !== db) return da.localeCompare(db);
      return String(a.start_time ?? "").localeCompare(String(b.start_time ?? ""));
    };
    u.sort(bySoonest);
    p.sort((a, b) => -bySoonest(a, b));
    return { upcoming: u, past: p };
  }, [sessions]);

  const list = tab === "upcoming" ? upcoming : past;

  const displayList = useMemo(() => {
    if (tab !== "upcoming" || !tourDemoSession) return list;
    const id = String(tourDemoSession.booking_id ?? tourDemoSession.id ?? "");
    const rest = list.filter((x) => String(x.booking_id ?? x.id ?? "") !== id);
    return [tourDemoSession, ...rest];
  }, [list, tab, tourDemoSession]);

  const usablePackageCredits = useMemo(
    () => packageCredits.filter((c) => isPackageCreditUsable(c) && c.expert_user_id),
    [packageCredits],
  );

  function openMessageForSession(s: SessionRow) {
    const pid = partnerUserId(s);
    if (!pid) return;
    setMessagePartnerId(pid);
    setMessagePartnerName(s.partner_name ?? null);
    setMessagePartnerPhoto(s.partner_photo ?? null);
    setMessagePartnerExpertVisibilityState(s.partner_expert_visibility_state ?? null);
    setMessageTourDemo(Boolean(s.tour_demo));
    setMessageOpen(true);
  }

  return (
    <div className={dashboardViewCardClass}>
      <SessionPaymentDialog
        open={payOpen}
        onOpenChange={(o) => {
          setPayOpen(o);
          if (!o) setPayBookingId(null);
        }}
        bookingId={payBookingId}
        onPaid={() => void refresh()}
      />
      <SessionReviewDialog
        open={reviewOpen}
        onOpenChange={(o) => {
          setReviewOpen(o);
          if (!o) {
            setReviewBookingId(null);
            setReviewPartnerName(null);
          }
        }}
        bookingId={reviewBookingId}
        role={reviewRole}
        partnerName={reviewPartnerName}
        onSubmitted={() => void refresh()}
      />
      <SessionManageDialog
        open={manageSession != null}
        onOpenChange={(o) => {
          if (!o) setManageSession(null);
        }}
        session={manageSession}
        onPutStatus={(bookingId, status, reason) => void putStatus(bookingId, status, reason)}
        onPayForSession={(bid) => {
          setPayBookingId(bid);
          setPayOpen(true);
        }}
        onSessionUpdated={() => void refresh()}
      />
      <SessionDependabilityDetailsDialog
        open={detailsSession != null}
        onOpenChange={(o) => {
          if (!o) setDetailsSession(null);
        }}
        bookingId={
          detailsSession ? String(detailsSession.booking_id ?? detailsSession.id ?? "").trim() || null : null
        }
      />
      <MediaDeviceTestDialog open={mediaTestOpen} onOpenChange={setMediaTestOpen} />
      <PartnerConversationDialog
        open={messageOpen}
        onOpenChange={setMessageOpen}
        partnerId={messagePartnerId}
        partnerName={messagePartnerName}
        partnerPhoto={messagePartnerPhoto}
        partnerExpertVisibilityState={messagePartnerExpertVisibilityState}
        tourDemo={messageTourDemo}
      />
      <BookingRequestRespondDialog
        open={respondDialog != null}
        onOpenChange={(o) => {
          if (!o) setRespondDialog(null);
        }}
        action={respondDialog?.action ?? null}
        partnerName={respondDialog?.partnerName ?? "Learner"}
        bookingId={respondDialog?.bookingId ?? null}
        onCompleted={() => void refresh()}
      />
      {offerSession && partnerUserId(offerSession) ? (
        <SendOfferDialog
          open={offerSession != null}
          onOpenChange={(o) => {
            if (!o) setOfferSession(null);
          }}
          recipientUserId={partnerUserId(offerSession)!}
          recipientFullName={offerSession.partner_name?.trim() || "Learner"}
          recipientFirstName={(offerSession.partner_name?.trim() || "Learner").split(/\s+/)[0]}
          relatedBookingId={String(offerSession.booking_id ?? offerSession.id ?? "")}
          onSubmitted={() => {
            setOfferSession(null);
            void refresh();
          }}
        />
      ) : null}
      <BookingRequestSetupDialog
        open={setupSession != null}
        onOpenChange={(o) => {
          if (!o) setSetupSession(null);
        }}
        bookingId={
          setupSession ? String(setupSession.booking_id ?? setupSession.id ?? "").trim() || null : null
        }
        expertName={setupSession?.partner_name?.trim() || "Expert"}
        expertPhoto={setupSession?.partner_photo ?? null}
        expertVisibilityState={setupSession?.partner_expert_visibility_state ?? null}
        totalUsd={Number(setupSession?.total_price ?? setupSession?.total_amount ?? 0) || null}
        onCompleted={() => void refresh()}
      />
      <DashboardViewHeader
        Icon={Calendar}
        title="Booked Sessions"
        subtitle="The link to join a session is available ten minutes before the scheduled start time through the end of the session."
        actions={
          <button
            type="button"
            aria-label="Refresh sessions"
            onClick={() => void refresh()}
            className="rounded-md p-2 text-[#003049] transition hover:bg-[#003049]/5"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
        }
      />

      {roleMode === "learner" && usablePackageCredits.length > 0 ? (
        <div className="mt-6 space-y-3">
          {usablePackageCredits.map((c) => {
            const expertName = c.expert_name?.trim() || "Expert";
            const initials = expertName
              .split(/\s+/)
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            const durationSuffix =
              c.session_duration_minutes != null && c.session_duration_minutes > 0
                ? ` · ${formatPackageDurationForNotice(c.session_duration_minutes)} each`
                : "";
            const remainingLabel =
              c.session_count != null && c.session_count > 0
                ? `${c.remaining_credits} of ${c.session_count} session${c.session_count === 1 ? "" : "s"} remaining${durationSuffix}`
                : `${c.remaining_credits} session${c.remaining_credits === 1 ? "" : "s"} remaining${durationSuffix}`;
            return (
              <div
                key={c.credit_id}
                className="flex flex-col gap-4 rounded-xl border border-[#003049]/15 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-12 w-12 shrink-0 border border-[#003049]/10">
                    {c.expert_profile_photo ? (
                      <AvatarImage src={c.expert_profile_photo} alt="" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-muted text-sm font-semibold text-[#003049]">
                      {initials || "EX"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#003049]">{expertName}</p>
                    <p className="text-sm font-medium text-foreground">{remainingLabel}</p>
                  </div>
                </div>
                <Button
                  asChild
                  className="w-full shrink-0 bg-convene-hero text-white hover:opacity-95 sm:w-auto"
                >
                  <Link href={`/experts/${encodeURIComponent(c.expert_user_id!)}`}>Book now</Link>
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-6 grid w-full max-w-md grid-cols-2 gap-1 rounded-lg border border-[#003049]/15 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab("upcoming")}
          className={cn(dashboardTabPillClass(tab === "upcoming"), "w-full")}
        >
          Upcoming ({upcoming.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("past")}
          className={cn(dashboardTabPillClass(tab === "past"), "w-full")}
        >
          Past ({past.length})
        </button>
      </div>

      {loadErr ? (
        <p className="mt-4 text-sm text-red-600">
          {loadErr}{" "}
          <Link href="/login" className="font-medium text-[#F77F00] underline">
            Sign in
          </Link>
        </p>
      ) : null}

      <div className={dashboardViewContentBoxClass}>
        {loading && !tourDemoSession ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : displayList.length === 0 ? (
          <div className="py-6 text-center">
            <Calendar className="mx-auto h-12 w-12 text-[#003049]/25" strokeWidth={1.5} aria-hidden />
            <p className="mt-3 text-sm text-muted-foreground">
              {tab === "upcoming" ? "No upcoming sessions." : "No past sessions yet."}
            </p>
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
          <ul className="space-y-4">
            {displayList.map((s) => {
              const id = String(s.id ?? s.booking_id ?? "");
              const price = s.total_price ?? s.total_amount;
              const ps = String(s.payment_status ?? "").toLowerCase();
              const unpaid = ps !== "paid" && ps !== "succeeded";
              const st = String(s.status ?? "").toLowerCase();
              const isCancelled = st === "cancelled" || !!s.cancelled_at;
              const tourDemo = Boolean(s.tour_demo);
              const paid = tourDemo || !unpaid;
              const joinWindow = isSessionJoinWindowOpen(s.session_date, s.start_time);
              const inactiveForRoleMode =
                !tourDemo && isSessionInactiveForRoleMode(roleMode, s.user_role);
              const joinAllowed =
                tourDemo ||
                (paid &&
                  !isCancelled &&
                  !inactiveForRoleMode &&
                  (st === "live" || (st === "upcoming" && joinWindow)));
              const pid = partnerUserId(s);
              const partnerHref = partnerProfileHref(s);
              const isPastTab = tab === "past";
              const sessionEnded = isPastTab || st === "complete" || isCancelled;
              const profession = tourDemo
                ? (s.tour_partner_profession ?? "").trim() || null
                : (s.partner_profession ?? "").trim() || null;
              const paymentFailed = ps === "failed";
              const userRoleLower = String(s.user_role ?? "").toLowerCase();
              const showRetryPayment =
                userRoleLower === "learner" && paymentFailed && !isCancelled;
              const showCompletePayment =
                userRoleLower === "learner" && ps === "pending" && !isCancelled && tab === "upcoming";
              const paymentUi = bookingPaymentUi(s, tourDemo);
              const paymentLabel = bookingPaymentLabel(paymentUi, userRoleLower, s.stripe_payment_method_id);
              const isAwaitingApproval =
                tab === "upcoming" &&
                !tourDemo &&
                !isCancelled &&
                isBookingRequestSubmittedToExpert(ps, s.stripe_payment_method_id);
              const isIncompleteBookingRequest =
                tab === "upcoming" &&
                !tourDemo &&
                !isCancelled &&
                userRoleLower === "learner" &&
                isBookingRequestAwaitingPaymentMethod(ps, s.stripe_payment_method_id);
              const isBookingRequest = isAwaitingApproval && userRoleLower === "expert";
              const isNoShow =
                st === "no_show_expert" || st === "no_show_learner" || st === "no_show";
              const reviewSubmitted = Boolean(s.review_submitted);
              const sessionDoneForReview =
                st === "complete" || hasSessionEndedByWallClock(s.session_date, s.end_time);
              const showLeaveReview =
                isPastTab &&
                sessionDoneForReview &&
                !isCancelled &&
                !tourDemo &&
                paid &&
                !reviewSubmitted &&
                !isNoShow;

              const reschedulePending =
                Boolean(String(s.pending_reschedule_date ?? "").trim()) &&
                !tourDemo &&
                tab === "upcoming" &&
                !isCancelled;

              return (
                <li
                  key={id || JSON.stringify(s)}
                  className={cn(
                    "flex flex-col gap-4 rounded-xl border border-[#003049]/10 bg-white p-4 shadow-sm",
                    isAwaitingApproval && "border-[#003049]/20 bg-[#003049]/[0.07]",
                    inactiveForRoleMode && "border-[#003049]/8 bg-gray-50 opacity-70",
                  )}
                >
                  <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-center lg:gap-x-8">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-start gap-4">
                        <div className="relative h-24 w-24 shrink-0">
                          {partnerHref ? (
                            <Link
                              href={partnerHref}
                              aria-label={`View ${(s.partner_name || "partner").trim()} profile`}
                              className="relative mx-0 block h-full w-full overflow-hidden rounded-full border border-[#003049]/10 bg-gray-50 outline-none ring-offset-2 transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[#003049]/30"
                            >
                              {s.partner_photo ? (
                                <Image
                                  src={s.partner_photo}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes="96px"
                                  unoptimized
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-[#003049]/40">
                                  {(s.partner_name || "?").slice(0, 1).toUpperCase()}
                                </div>
                              )}
                            </Link>
                          ) : (
                            <div className="relative h-full w-full overflow-hidden rounded-full border border-[#003049]/10 bg-gray-50">
                              {s.partner_photo ? (
                                <Image
                                  src={s.partner_photo}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes="96px"
                                  unoptimized
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-[#003049]/40">
                                  {(s.partner_name || "?").slice(0, 1).toUpperCase()}
                                </div>
                              )}
                            </div>
                          )}
                          <VisibleTempDot expertVisibilityState={s.partner_expert_visibility_state} />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              {partnerHref ? (
                                <Link
                                  href={partnerHref}
                                  className="block rounded-lg outline-none transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[#003049]/30 focus-visible:ring-offset-2"
                                >
                                  <p className="text-lg font-semibold leading-tight text-[#003049]">
                                    {s.partner_name?.trim() || "Session"}
                                  </p>
                                  {profession ? (
                                    <p className="mt-0.5 text-sm font-medium text-[#F77F00]">{profession}</p>
                                  ) : null}
                                </Link>
                              ) : (
                                <div>
                                  <p className="text-lg font-semibold leading-tight text-[#003049]">
                                    {s.partner_name?.trim() || "Session"}
                                  </p>
                                  {profession ? (
                                    <p className="mt-0.5 text-sm font-medium text-[#F77F00]">{profession}</p>
                                  ) : null}
                                </div>
                              )}
                            </div>
                            {reschedulePending ? (
                              <SessionNoticeIcon
                                ariaLabel="Pending reschedule details"
                                title="Pending Reschedule"
                                body="A new session time was proposed. The session stays at the original time until your partner accepts. If they decline, the booking will be canceled and refunded. Accept or decline in your message thread."
                              />
                            ) : null}
                          </div>
                          <span
                            className={
                              paymentUi === "failed" ? PAYMENT_FAILED_PILL_CLASS : PAYMENT_PILL_CLASS
                            }
                          >
                            {price != null && !tourDemo ? (
                              <>
                                <span className="tabular-nums">${Number(price).toFixed(2)}</span>
                                <span aria-hidden className="font-normal">
                                  {'\u00a0|\u00a0'}
                                </span>
                              </>
                            ) : null}
                            {paymentLabel}
                          </span>
                          {tab === "upcoming" && !isCancelled ? (
                            <button
                              type="button"
                              aria-label="Test camera and microphone"
                              className="inline-flex max-w-full items-center gap-1.5 p-0 text-left text-xs font-medium text-[#F77F00] transition hover:text-[#F77F00]/85"
                              onClick={() => setMediaTestOpen(true)}
                            >
                              <span>Test</span>
                              <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              <span>and</span>
                              <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-0 justify-center lg:px-2">
                      <div
                        className={cn(
                          "w-full max-w-sm rounded-lg bg-convene-primary px-8 py-3 text-left shadow-sm",
                          inactiveForRoleMode && "bg-[#003049]/45",
                        )}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wide text-white/85">
                          Session details
                        </p>
                        <div className="mt-2.5 flex flex-col gap-2 text-sm font-medium leading-snug text-white">
                          <span className="inline-flex items-center gap-2">
                            <Calendar className="h-4 w-4 shrink-0 text-white/90" aria-hidden />
                            <span>{formatSessionDateCol(s.session_date)}</span>
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <Clock className="h-4 w-4 shrink-0 text-white/90" aria-hidden />
                            <span className="tabular-nums">
                              {formatTimeRange(s.session_date, s.start_time, s.end_time)}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <Timer className="h-4 w-4 shrink-0 text-white/90" aria-hidden />
                            <span className="tabular-nums">{formatDurationLabel(s.duration_minutes)}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-0 w-full flex-col justify-center gap-2 lg:items-end lg:justify-self-end">
                      {isBookingRequest ? (
                        <>
                          <Button
                            type="button"
                            className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-0 bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                            onClick={() =>
                              setRespondDialog({
                                bookingId: id,
                                partnerName: s.partner_name?.trim() || "Learner",
                                action: "approve",
                              })
                            }
                          >
                            <Check className="h-4 w-4" aria-hidden />
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-2 border-red-300 bg-white text-red-700 hover:bg-red-50"
                            onClick={() =>
                              setRespondDialog({
                                bookingId: id,
                                partnerName: s.partner_name?.trim() || "Learner",
                                action: "decline",
                              })
                            }
                          >
                            <X className="h-4 w-4" aria-hidden />
                            Decline
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-2 border-[#003049] bg-white text-[#003049] hover:bg-[#003049]/5"
                            onClick={() => setOfferSession(s)}
                          >
                            <Gift className="h-4 w-4" aria-hidden />
                            Send an offer
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!pid}
                            className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-2 border-[#003049] bg-white text-[#003049] hover:bg-[#003049]/5"
                            onClick={() => openMessageForSession(s)}
                          >
                            <MessageSquare className="h-4 w-4" aria-hidden />
                            Message
                          </Button>
                        </>
                      ) : isIncompleteBookingRequest ? (
                        <>
                          <p className="max-w-[11rem] self-end text-right text-xs leading-snug text-[#003049]/80">
                            Save a card to send this request to your expert.
                          </p>
                          <Button
                            type="button"
                            className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-0 bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                            onClick={() => setSetupSession(s)}
                          >
                            <Video className="h-4 w-4" aria-hidden />
                            Complete request
                          </Button>
                        </>
                      ) : showCompletePayment ? (
                      <>
                        <p className="max-w-[11rem] self-end text-right text-xs leading-snug text-[#003049]/80">
                          Your expert approved this session. Complete payment to confirm.
                        </p>
                        <Button
                          type="button"
                          className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-0 bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                          onClick={() => {
                            setPayBookingId(id);
                            setPayOpen(true);
                          }}
                        >
                          <Video className="h-4 w-4" aria-hidden />
                          Complete payment
                        </Button>
                      </>
                      ) : showRetryPayment ? (
                      <>
                        <p className="max-w-[11rem] self-end text-right text-xs leading-snug text-red-600">
                          We couldn&apos;t charge your card. Retry checkout below.
                        </p>
                        <Button
                          type="button"
                          className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-0 bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                          onClick={() => {
                            setPayBookingId(id);
                            setPayOpen(true);
                          }}
                        >
                          <Video className="h-4 w-4" aria-hidden />
                          Retry payment
                        </Button>
                      </>
                      ) : tourDemo && String(s.user_role ?? "").toLowerCase() === "expert" ? (
                      <Button
                        type="button"
                        data-tour-target="tour-join-session"
                        className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-0 bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                        onClick={(e) => e.preventDefault()}
                      >
                        <Video className="h-4 w-4" aria-hidden />
                        Join Session
                      </Button>
                      ) : tourDemo ? (
                      <Button
                        type="button"
                        asChild={joinAllowed}
                        disabled={!joinAllowed}
                        className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-0 bg-[#F77F00] text-white hover:bg-[#F77F00]/90 disabled:bg-gray-200 disabled:text-gray-500"
                      >
                        {joinAllowed ? (
                          <Link href={`/session/${id}`} data-tour-target="tour-join-session">
                            <Video className="h-4 w-4" aria-hidden />
                            Join Session
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-2" data-tour-target="tour-join-session">
                            <Video className="h-4 w-4" aria-hidden />
                            Join Session
                          </span>
                        )}
                      </Button>
                      ) : showLeaveReview ? (
                      <Button
                        type="button"
                        className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-0 bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                        onClick={() => {
                          setReviewBookingId(id);
                          setReviewRole(userRoleLower === "expert" ? "expert" : "learner");
                          setReviewPartnerName(s.partner_name ?? null);
                          setReviewOpen(true);
                        }}
                      >
                        <Star className="h-4 w-4" aria-hidden />
                        Leave a Review
                      </Button>
                      ) : isPastTab && reviewSubmitted && !isNoShow ? (
                      <Button
                        type="button"
                        disabled
                        variant="secondary"
                        className="h-10 w-full max-w-[11rem] lg:w-[11rem] border border-[#003049]/15 bg-gray-100 text-gray-500"
                      >
                        <Star className="h-4 w-4" aria-hidden />
                        Leave a Review
                      </Button>
                      ) : isPastTab && isNoShow ? (
                      <p className="flex min-h-10 max-w-[11rem] items-center self-end justify-end text-right text-xs text-muted-foreground">
                        No-show recorded
                      </p>
                      ) : sessionEnded ? (
                      <Button
                        type="button"
                        disabled
                        variant="secondary"
                        className="h-10 w-full max-w-[11rem] lg:w-[11rem] border border-[#003049]/15 bg-gray-100 text-gray-500"
                      >
                        <Video className="h-4 w-4" aria-hidden />
                        Join Session
                      </Button>
                      ) : joinAllowed ? (
                      <Button
                        asChild
                        className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-0 bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                      >
                        <Link href={`/session/${id}`}>
                          <Video className="h-4 w-4" aria-hidden />
                          Join Session
                        </Link>
                      </Button>
                      ) : inactiveForRoleMode && tab === "upcoming" && !sessionEnded ? (
                      <Button
                        type="button"
                        disabled
                        variant="secondary"
                        className="h-10 w-full max-w-[11rem] lg:w-[11rem] border border-[#003049]/15 bg-gray-100 text-gray-500"
                      >
                        <Video className="h-4 w-4" aria-hidden />
                        Join Session
                      </Button>
                      ) : (
                      <Button
                        type="button"
                        disabled
                        variant="secondary"
                        title="Available starting 10 minutes before the scheduled time"
                        className="h-10 w-full max-w-[11rem] lg:w-[11rem] border border-[#003049]/15 bg-gray-100 text-gray-500"
                      >
                        <Video className="h-4 w-4" aria-hidden />
                        Join Session
                      </Button>
                      )}

                      {!isBookingRequest ? (
                      <Button
                      type="button"
                      variant="outline"
                      disabled={!pid && !tourDemo}
                      className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-2 border-[#003049] bg-white text-[#003049] hover:bg-[#003049]/5"
                      onClick={() => openMessageForSession(s)}
                    >
                      <MessageSquare className="h-4 w-4" aria-hidden />
                      Message
                      </Button>
                      ) : null}

                      {tab === "upcoming" && !isBookingRequest ? (
                      <Button
                      type="button"
                      variant="outline"
                      data-tour-target={tourDemo ? "tour-manage-booking" : undefined}
                      className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-2 border-[#003049] bg-white text-[#003049] hover:bg-[#003049]/5"
                      onClick={() => setManageSession(s)}
                    >
                      <ClipboardList className="h-4 w-4" aria-hidden />
                      Manage
                      </Button>
                      ) : null}

                      {tab === "past" ? (
                      <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full max-w-[11rem] lg:w-[11rem] border-2 border-[#003049] bg-white text-[#003049] hover:bg-[#003049]/5"
                      onClick={() => setDetailsSession(s)}
                    >
                      <Info className="h-4 w-4" aria-hidden />
                      Session Details
                      </Button>
                      ) : null}
                    </div>
                  </div>
                  {inactiveForRoleMode && tab === "upcoming" && !sessionEnded ? (
                    <p className="text-center text-xs font-medium text-muted-foreground">
                      {switchModeJoinHint(roleMode)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
