"use client";

import Daily from "@daily-co/daily-js";
import type { DailyCall } from "@daily-co/daily-js";
import { Calendar, Clock, Loader2, Mic, Timer, Video } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MediaTroubleshootCollapsible } from "@/components/dashboard/MediaTroubleshootCollapsible";
import { SignInDialog } from "@/components/auth/SignInDialog";
import { VisibleTempDot } from "@/components/presence/VisibleTempDot";
import { SessionReviewDialog } from "@/components/dashboard/SessionReviewDialog";
import { SessionExtensionPaymentPanel } from "@/components/session/SessionExtensionPaymentDialog";
import { WaitingRoomLateJoinDialog } from "@/components/session/WaitingRoomLateJoinDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  canEndSession,
  isTerminalSessionStatus,
} from "@/lib/resolveManualSessionEndStatus";
import { hasSessionEndedByWallClock, isSessionJoinWindowOpen, sessionWallClockInstant } from "@/lib/sessionWallClock";
import type { SessionLiveTimingPayload } from "@/lib/sessionRoomLiveTiming";
import { cn } from "@/lib/utils";
import {
  LATE_JOIN_REMIND_EVERY_MS,
  lateJoinPhase,
  partnerDisplayName,
  type LateJoinPhase,
} from "@/lib/waiting-room-late-join";

/** Set after a successful in-page getUserMedia; next /session visit skips the gate UI if the browser still allows access. */
const SESSION_MEDIA_GATE_STORAGE_KEY = "convene.session.mediaGateAck.v1";

function readSessionMediaGateAck(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SESSION_MEDIA_GATE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistSessionMediaGateAck(): void {
  try {
    localStorage.setItem(SESSION_MEDIA_GATE_STORAGE_KEY, "1");
  } catch {
    /* private mode or storage disabled */
  }
}

function clearSessionMediaGateAck(): void {
  try {
    localStorage.removeItem(SESSION_MEDIA_GATE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

type Party = {
  user_id: string;
  display_name: string;
  profile_photo: string | null;
  profession: string | null;
  expert_visibility_state?: string | null;
};

type BookingPayload = {
  booking_id: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  duration?: unknown;
  status?: string;
  user_role?: string;
  partner_name?: string | null;
  payment_status?: string | null;
  cancelled_at?: string | null;
  learner_joined?: string | null;
  expert_joined?: string | null;
};

function durationMinutesFromRow(b: {
  duration?: unknown;
  start_time?: unknown;
  end_time?: unknown;
}): number | null {
  const dur = b.duration;
  if (dur != null) {
    const s = String(dur);
    const minMatch = s.match(/(\d+)\s*minutes?/i);
    if (minMatch) return Number(minMatch[1]);
    const iso = /^(\d+):(\d{2}):(\d{2})/.exec(s);
    if (iso) {
      const h = Number(iso[1]);
      const mi = Number(iso[2]);
      const sec = Number(iso[3]);
      if ([h, mi, sec].every((n) => Number.isFinite(n))) {
        return Math.round(h * 60 + mi + sec / 60);
      }
    }
  }
  const timeStrToMinutes = (t: unknown): number | null => {
    const str = String(t ?? "").trim();
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(str);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const sm = timeStrToMinutes(b.start_time);
  const em = timeStrToMinutes(b.end_time);
  if (sm != null && em != null && em > sm) return em - sm;
  return null;
}

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
  return `${a.toLocaleTimeString("en-US", o)} – ${b.toLocaleTimeString("en-US", o)}`;
}

function formatDurationLabel(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}

function formatSessionEndClock(sessionDate: string | undefined, endTime: string | undefined): string | null {
  const end = sessionWallClockInstant(sessionDate ?? "", endTime);
  if (!end) return null;
  return end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Countdown / overrun relative to scheduled start (same wall clock as dashboard cards). */
function startsInLine(
  sessionDate: string | undefined,
  startTime: string | undefined,
  nowMs: number
): { text: string; variant: "soon" | "late" } | null {
  const start = sessionWallClockInstant(sessionDate ?? "", startTime);
  if (!start) return null;
  const delta = start.getTime() - nowMs;
  if (delta > 0) {
    const mins = Math.max(1, Math.ceil(delta / 60000));
    return { text: `Starts in ${mins} min`, variant: "soon" };
  }
  const lateMin = Math.floor((nowMs - start.getTime()) / 60000);
  if (lateMin >= 1) return { text: `Starts in -${lateMin} min`, variant: "late" };
  return { text: "Starts now", variant: "late" };
}

function stopMediaStream(stream: MediaStream) {
  for (const t of stream.getTracks()) {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  }
}

/** Daily allows one iframe per window — must fully destroy before createFrame (await destroy()). */
async function destroyDailyCall(call: DailyCall | null): Promise<void> {
  const getInstance =
    typeof (Daily as { getCallInstance?: () => DailyCall | undefined }).getCallInstance === "function"
      ? (Daily as { getCallInstance: () => DailyCall | undefined }).getCallInstance
      : null;
  const target = call ?? getInstance?.() ?? null;
  if (!target) return;

  try {
    const destroyed =
      typeof (target as { isDestroyed?: () => boolean }).isDestroyed === "function" &&
      (target as { isDestroyed: () => boolean }).isDestroyed();
    if (destroyed) return;
  } catch {
    /* ignore */
  }

  try {
    await target.leave();
  } catch {
    /* already left */
  }

  try {
    await target.destroy();
  } catch {
    /* ignore */
  }
}

function clearDailyContainer(el: HTMLDivElement | null) {
  if (!el) return;
  el.replaceChildren();
}

/** Align with dashboard “Leave a review”: paid, not cancelled / no-show, session start has passed, review not yet in DB for this user. */
function eligibleForSessionReviewPrompt(b: BookingPayload | null, reviewAlreadySubmitted: boolean): boolean {
  if (!b || reviewAlreadySubmitted) return false;
  const st = String(b.status ?? "").toLowerCase();
  if (st === "cancelled" || b.cancelled_at) return false;
  if (st === "no_show_expert" || st === "no_show_learner" || st === "no_show") return false;
  const ps = String(b.payment_status ?? "").toLowerCase();
  const paid = ps === "paid" || ps === "succeeded";
  if (!paid) return false;
  const sessionStart = sessionWallClockInstant(b.session_date ?? "", b.start_time);
  if (!sessionStart || Date.now() < sessionStart.getTime()) return false;
  return true;
}

/** Only prompt once the session is over by wall clock or backend status (matches dashboard Past + “Leave a review”). */
function shouldPromptSessionReview(b: BookingPayload | null, reviewAlreadySubmitted: boolean): boolean {
  if (!eligibleForSessionReviewPrompt(b, reviewAlreadySubmitted)) return false;
  const st = String(b?.status ?? "").toLowerCase();
  return st === "complete" || hasSessionEndedByWallClock(b?.session_date, b?.end_time);
}

type SessionApiResponse = {
  error?: string;
  booking?: BookingPayload;
  expert?: Party | null;
  learner?: Party | null;
  viewer_review_submitted?: boolean;
  live_timing?: SessionLiveTimingPayload;
};

type Props = { bookingId: string };

export function SessionRoomClient({ bookingId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const sessionPath = `/session/${bookingId}`;
  const [booking, setBooking] = useState<BookingPayload | null>(null);
  const [expert, setExpert] = useState<Party | null>(null);
  const [learner, setLearner] = useState<Party | null>(null);
  const [viewerReviewSubmitted, setViewerReviewSubmitted] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [callErr, setCallErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  /** After the user leaves Daily, show rejoin UI (camera/mic gate is skipped—already granted). */
  const [showRejoinPrompt, setShowRejoinPrompt] = useState(false);
  /** Wall-clock end fired while still in-call — suppress rejoin; refreshed booking end clears this (e.g. paid extension). */
  const [endedBySchedule, setEndedBySchedule] = useState(false);
  /** Participant ended the session (self or partner via status poll). */
  const [sessionManuallyEnded, setSessionManuallyEnded] = useState(false);
  const [noShowSettlementNote, setNoShowSettlementNote] = useState<string | null>(null);
  const [endSessionBusy, setEndSessionBusy] = useState(false);
  const [endSessionErr, setEndSessionErr] = useState<string | null>(null);
  /** Learner hides the extend CTA until the offer window resets (minute count goes above 10). */
  const [dismissExtendBar, setDismissExtendBar] = useState(false);
  const [liveTiming, setLiveTiming] = useState<SessionLiveTimingPayload | null>(null);
  const [extendPayOpen, setExtendPayOpen] = useState(false);
  /** Expert: set when booking end time moves later (learner paid for an extension). */
  const [expertExtendNotice, setExpertExtendNotice] = useState<string | null>(null);
  const expertEndBaselineMsRef = useRef<number | null>(null);
  const [waitingRoomTick, setWaitingRoomTick] = useState(0);
  const [lateJoinTick, setLateJoinTick] = useState(0);
  const [fiveMinLateNoticeSeen, setFiveMinLateNoticeSeen] = useState(false);
  const [lateJoinDialogOpen, setLateJoinDialogOpen] = useState(false);
  const [lateJoinSnoozeUntilMs, setLateJoinSnoozeUntilMs] = useState<number | null>(null);
  const [reportNoShowBusy, setReportNoShowBusy] = useState(false);
  const [endEligibilityTick, setEndEligibilityTick] = useState(0);
  /** User has allowed camera/mic for this page (session lifetime; rejoin skips the gate). */
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaGateErr, setMediaGateErr] = useState<"denied" | "unavailable" | null>(null);
  /** True while auto-running getUserMedia from a prior successful visit (skip full gate UI). */
  const [rememberedMediaAttempt, setRememberedMediaAttempt] = useState(false);
  /** Auto gate runs once per bookingId when localStorage says the user already granted access before. */
  const autoGateRanForBookingIdRef = useRef<string | null>(null);
  const [joinWindowTick, setJoinWindowTick] = useState(0);
  const sessionReviewPromptShownRef = useRef(false);
  /** Avoid overlapping timer-driven `leave()` calls. */
  const timerLeaveBusyRef = useRef(false);
  const sessionFinalizedRef = useRef(false);
  const bookingRef = useRef(booking);
  const reviewSubmittedRef = useRef(viewerReviewSubmitted);
  useEffect(() => {
    bookingRef.current = booking;
  }, [booking]);
  useEffect(() => {
    reviewSubmittedRef.current = viewerReviewSubmitted;
  }, [viewerReviewSubmitted]);

  const tryOpenSessionReviewPrompt = useCallback(() => {
    if (sessionReviewPromptShownRef.current) return;
    const b = bookingRef.current;
    if (!shouldPromptSessionReview(b, reviewSubmittedRef.current)) return;
    sessionReviewPromptShownRef.current = true;
    setReviewOpen(true);
  }, []);

  useEffect(() => {
    setMediaReady(false);
    setMediaBusy(false);
    setMediaGateErr(null);
    setRememberedMediaAttempt(false);
    autoGateRanForBookingIdRef.current = null;
    sessionReviewPromptShownRef.current = false;
    sessionFinalizedRef.current = false;
    setReviewOpen(false);
    setShowRejoinPrompt(false);
    setEndedBySchedule(false);
    setSessionManuallyEnded(false);
    setNoShowSettlementNote(null);
    setFiveMinLateNoticeSeen(false);
    setLateJoinDialogOpen(false);
    setLateJoinSnoozeUntilMs(null);
    setReportNoShowBusy(false);
    setEndSessionBusy(false);
    setEndSessionErr(null);
    setDismissExtendBar(false);
    setLiveTiming(null);
    setExtendPayOpen(false);
    setExpertExtendNotice(null);
    expertEndBaselineMsRef.current = null;
    setInCall(false);
    setParticipantCount(0);
    setCallErr(null);
    setBusy(false);
    setLoadErr(null);
    setNeedsSignIn(false);
    setSignInOpen(false);
    setBooking(null);
    void destroyDailyCall(callRef.current).finally(() => {
      callRef.current = null;
      clearDailyContainer(containerRef.current);
    });
  }, [bookingId]);

  useEffect(() => {
    if (!booking) return;
    const st = String(booking.status ?? "").toLowerCase();
    if (st !== "upcoming" && st !== "") return;
    const id = window.setInterval(() => setJoinWindowTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [booking]);

  const nowMs = Date.now() + 0 * joinWindowTick;
  const sessionStatus = String(booking?.status ?? "").toLowerCase();
  const joinWindowOpen =
    sessionStatus === "live" ||
    isSessionJoinWindowOpen(booking?.session_date, booking?.start_time, nowMs);
  const blockedBeforeJoinWindow =
    Boolean(booking) &&
    !inCall &&
    !joinWindowOpen &&
    sessionStatus === "upcoming" &&
    !booking?.cancelled_at;

  const refreshParticipants = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    try {
      const p = call.participants();
      setParticipantCount(Object.keys(p).length);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}`);
      const data = (await res.json()) as SessionApiResponse;
      if (cancelled) return;
      if (!res.ok) {
        if (res.status === 401) {
          setNeedsSignIn(true);
          setSignInOpen(true);
          setLoadErr(null);
          return;
        }
        setLoadErr(typeof data.error === "string" ? data.error : "Could not load session");
        return;
      }
      setNeedsSignIn(false);
      if (data.booking) setBooking(data.booking);
      if (data.expert != null) setExpert(data.expert);
      if (data.learner != null) setLearner(data.learner);
      setViewerReviewSubmitted(Boolean(data.viewer_review_submitted));
      if (data.live_timing) setLiveTiming(data.live_timing);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const finalizeSessionFromRemoteEnd = useCallback(
    async (nextBooking: BookingPayload) => {
      if (sessionFinalizedRef.current) return;
      sessionFinalizedRef.current = true;
      const frame = callRef.current;
      if (frame) {
        await destroyDailyCall(frame);
        callRef.current = null;
        clearDailyContainer(containerRef.current);
      }
      bookingRef.current = nextBooking;
      setBooking(nextBooking);
      setInCall(false);
      setShowRejoinPrompt(false);
      setSessionManuallyEnded(true);
      setEndSessionErr(null);
      tryOpenSessionReviewPrompt();
    },
    [tryOpenSessionReviewPrompt],
  );

  const endSession = useCallback(async () => {
    if (!bookingId || endSessionBusy || sessionFinalizedRef.current) return;
    setEndSessionErr(null);
    setEndSessionBusy(true);
    try {
      const frame = callRef.current;
      if (frame) {
        await destroyDailyCall(frame);
        callRef.current = null;
        clearDailyContainer(containerRef.current);
      }
      setInCall(false);
      setShowRejoinPrompt(false);

      const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}/end`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as SessionApiResponse & {
        ok?: boolean;
        status?: string;
        alreadyFinalized?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setEndSessionErr(typeof data.error === "string" ? data.error : "Could not end session");
        setShowRejoinPrompt(true);
        return;
      }

      sessionFinalizedRef.current = true;
      const refreshRes = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}`);
      const refreshData = (await refreshRes.json()) as SessionApiResponse;
      if (refreshRes.ok && refreshData.booking) {
        bookingRef.current = refreshData.booking;
        setBooking(refreshData.booking);
      } else if (data.booking) {
        bookingRef.current = data.booking;
        setBooking(data.booking);
      }
      setSessionManuallyEnded(true);
      tryOpenSessionReviewPrompt();
    } catch {
      setEndSessionErr("Could not end session");
      setShowRejoinPrompt(true);
    } finally {
      setEndSessionBusy(false);
    }
  }, [bookingId, endSessionBusy, tryOpenSessionReviewPrompt]);

  useEffect(() => {
    if (!inCall && !showRejoinPrompt) return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}`);
          const data = (await res.json()) as SessionApiResponse;
          if (!res.ok) return;
          if (data.booking && isTerminalSessionStatus(data.booking.status)) {
            await finalizeSessionFromRemoteEnd(data.booking);
            return;
          }
          if (data.booking) setBooking(data.booking);
          if (data.live_timing) setLiveTiming(data.live_timing);
        } catch {
          /* ignore */
        }
      })();
    }, 5000);
    return () => window.clearInterval(id);
  }, [bookingId, finalizeSessionFromRemoteEnd, inCall, showRejoinPrompt]);

  useEffect(() => {
    if (!booking?.session_date || !booking.end_time || booking.user_role !== "expert") return;
    const endMs = sessionWallClockInstant(booking.session_date, booking.end_time)?.getTime();
    if (endMs == null) return;
    const baseline = expertEndBaselineMsRef.current;
    if (baseline == null) {
      expertEndBaselineMsRef.current = endMs;
      return;
    }
    if (endMs > baseline + 30_000) {
      const clock = formatSessionEndClock(booking.session_date, booking.end_time);
      setExpertExtendNotice(
        clock
          ? `The learner extended this session. New end time: ${clock}.`
          : "The learner extended this session.",
      );
      expertEndBaselineMsRef.current = endMs;
    }
  }, [booking]);

  useEffect(() => {
    if (!expertExtendNotice) return;
    const id = window.setTimeout(() => setExpertExtendNotice(null), 90_000);
    return () => window.clearTimeout(id);
  }, [expertExtendNotice]);

  useEffect(() => {
    const m = liveTiming?.minutes_remaining;
    if (m != null && m > 10) setDismissExtendBar(false);
  }, [liveTiming?.minutes_remaining]);

  useEffect(() => {
    if (!booking) return;
    if (!hasSessionEndedByWallClock(booking.session_date, booking.end_time)) {
      setEndedBySchedule(false);
    }
  }, [booking]);

  useEffect(() => {
    if (!inCall) return;
    const tick = () => {
      if (timerLeaveBusyRef.current) return;
      const b = bookingRef.current;
      if (!b) return;
      if (!hasSessionEndedByWallClock(b.session_date, b.end_time)) return;
      timerLeaveBusyRef.current = true;
      void (async () => {
        const frame = callRef.current;
        if (frame) {
          await destroyDailyCall(frame);
          callRef.current = null;
          clearDailyContainer(containerRef.current);
        }
        setInCall(false);
        setShowRejoinPrompt(false);
        setEndedBySchedule(true);
        timerLeaveBusyRef.current = false;
        tryOpenSessionReviewPrompt();
      })();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [inCall, tryOpenSessionReviewPrompt]);

  useEffect(() => {
    return () => {
      void destroyDailyCall(callRef.current).finally(() => {
        callRef.current = null;
      });
    };
  }, []);

  useEffect(() => {
    const call = callRef.current;
    if (!call || !inCall) return;

    const update = () => refreshParticipants();

    const onLeft = () => {
      setInCall(false);
      setShowRejoinPrompt(true);
      tryOpenSessionReviewPrompt();
      void destroyDailyCall(callRef.current).finally(() => {
        callRef.current = null;
        clearDailyContainer(containerRef.current);
      });
    };

    call.on("participant-joined", update);
    call.on("participant-left", update);
    call.on("joined-meeting", update);
    call.on("left-meeting", onLeft);
    refreshParticipants();

    return () => {
      call.off("participant-joined", update);
      call.off("participant-left", update);
      call.off("joined-meeting", update);
      call.off("left-meeting", onLeft);
    };
  }, [inCall, refreshParticipants, tryOpenSessionReviewPrompt]);

  /** When scheduled end passes while still in the call, open the review dialog once (same rules as dashboard). */
  useEffect(() => {
    if (!inCall) return;
    tryOpenSessionReviewPrompt();
    const id = window.setInterval(() => {
      tryOpenSessionReviewPrompt();
    }, 10_000);
    return () => window.clearInterval(id);
  }, [inCall, tryOpenSessionReviewPrompt]);

  const startOrReconnectCall = useCallback(async () => {
    if (!bookingId || !containerRef.current) return;
    if (blockedBeforeJoinWindow) return;
    setShowRejoinPrompt(false);
    setCallErr(null);
    setBusy(true);
    const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}/room`, {
      method: "POST",
    });
    const data = (await res.json()) as { roomUrl?: string; error?: string };
    if (!res.ok) {
      setCallErr(data.error ?? "Could not start room");
      setBusy(false);
      return;
    }
    const url = data.roomUrl;
    if (!url) {
      setCallErr("No room URL returned");
      setBusy(false);
      return;
    }

    await destroyDailyCall(callRef.current);
    callRef.current = null;
    clearDailyContainer(containerRef.current);

    if (!containerRef.current) {
      setCallErr("Video container unavailable");
      setBusy(false);
      return;
    }

    const frame = Daily.createFrame(containerRef.current, {
      showLeaveButton: true,
      iframeStyle: {
        width: "100%",
        height: "100%",
        minHeight: "100%",
        border: "0",
        borderRadius: "0",
      },
    });
    callRef.current = frame;

    const display =
      booking?.user_role === "expert"
        ? expert?.display_name ?? "Expert"
        : learner?.display_name ?? "Guest";

    try {
      await frame.join({
        url,
        userName: display,
      });
      setInCall(true);
      void fetch(`/api/sessions/${encodeURIComponent(bookingId)}/record-join`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Join failed";
      setCallErr(msg);
      await destroyDailyCall(frame);
      callRef.current = null;
      clearDailyContainer(containerRef.current);
    }
    setBusy(false);
  }, [
    blockedBeforeJoinWindow,
    booking?.user_role,
    bookingId,
    expert?.display_name,
    learner?.display_name,
  ]);

  const requestMediaAccessThenJoin = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRememberedMediaAttempt(false);
      setMediaGateErr("unavailable");
      return;
    }
    setMediaGateErr(null);
    setMediaBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stopMediaStream(stream);
      persistSessionMediaGateAck();
      setMediaReady(true);
      await startOrReconnectCall();
    } catch (e) {
      setRememberedMediaAttempt(false);
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        clearSessionMediaGateAck();
        setMediaGateErr("denied");
      } else {
        setMediaGateErr("unavailable");
      }
    } finally {
      setMediaBusy(false);
    }
  }, [startOrReconnectCall]);

  useLayoutEffect(() => {
    if (!booking) return;
    if (blockedBeforeJoinWindow) return;
    if (showRejoinPrompt || mediaReady) return;
    if (!readSessionMediaGateAck()) return;
    if (autoGateRanForBookingIdRef.current === bookingId) return;
    autoGateRanForBookingIdRef.current = bookingId;
    setRememberedMediaAttempt(true);
    void requestMediaAccessThenJoin();
  }, [blockedBeforeJoinWindow, booking, bookingId, mediaReady, requestMediaAccessThenJoin, showRejoinPrompt]);

  const durationMin = booking ? durationMinutesFromRow(booking) : null;
  const showPrejoinStrip = participantCount < 2;

  useEffect(() => {
    if (!inCall || !showPrejoinStrip) return;
    const id = window.setInterval(() => setWaitingRoomTick((n) => n + 1), 30000);
    return () => window.clearInterval(id);
  }, [inCall, showPrejoinStrip]);
  useEffect(() => {
    if (!inCall || !showPrejoinStrip || !booking) return;
    const id = window.setInterval(() => setLateJoinTick((n) => n + 1), 10_000);
    return () => window.clearInterval(id);
  }, [booking, inCall, showPrejoinStrip]);
  useEffect(() => {
    if (!showRejoinPrompt) return;
    const id = window.setInterval(() => setEndEligibilityTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [showRejoinPrompt]);

  const endSessionAllowed = canEndSession(booking, Date.now() + 0 * endEligibilityTick);

  const startsInWaiting =
    inCall && showPrejoinStrip && booking
      ? startsInLine(booking.session_date, booking.start_time, Date.now() + 0 * waitingRoomTick)
      : null;

  const waitingRoomParties =
    inCall && showPrejoinStrip && expert && learner ? { expert, learner } : null;

  const viewerRole = booking?.user_role === "expert" ? "expert" : "learner";
  const waitingPartnerName = partnerDisplayName(
    viewerRole,
    expert,
    learner,
    booking?.partner_name,
  );
  const currentLateJoinPhase: LateJoinPhase =
    inCall && showPrejoinStrip && booking
      ? lateJoinPhase(booking.session_date, booking.start_time, Date.now() + 0 * lateJoinTick)
      : "none";

  const lateJoinDialogVariant =
    currentLateJoinPhase === "ten_min_action" ? "ten_min_action" : "five_min_info";

  useEffect(() => {
    if (!inCall || !showPrejoinStrip || !booking) {
      setLateJoinDialogOpen(false);
      return;
    }
    if (currentLateJoinPhase === "none") {
      setLateJoinDialogOpen(false);
      return;
    }
    if (currentLateJoinPhase === "five_min_info") {
      if (!fiveMinLateNoticeSeen) {
        setLateJoinDialogOpen(true);
      }
      return;
    }
    const snoozed = lateJoinSnoozeUntilMs != null && Date.now() < lateJoinSnoozeUntilMs;
    setLateJoinDialogOpen(!snoozed);
  }, [
    booking,
    currentLateJoinPhase,
    fiveMinLateNoticeSeen,
    inCall,
    lateJoinSnoozeUntilMs,
    lateJoinTick,
    showPrejoinStrip,
  ]);

  const dismissLateJoinDialog = useCallback(() => {
    if (currentLateJoinPhase === "five_min_info") {
      setFiveMinLateNoticeSeen(true);
    } else {
      setLateJoinSnoozeUntilMs(Date.now() + LATE_JOIN_REMIND_EVERY_MS);
    }
    setLateJoinDialogOpen(false);
  }, [currentLateJoinPhase]);

  const reportNoShow = useCallback(async () => {
    if (!bookingId || reportNoShowBusy) return;
    setReportNoShowBusy(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}/report-no-show`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as {
        error?: string;
        booking?: BookingPayload;
        settlementNote?: string | null;
      };
      if (!res.ok) {
        window.alert(typeof data.error === "string" ? data.error : "Could not report no-show");
        return;
      }
      const frame = callRef.current;
      if (frame) {
        await destroyDailyCall(frame);
        callRef.current = null;
        clearDailyContainer(containerRef.current);
      }
      setInCall(false);
      setLateJoinDialogOpen(false);
      if (data.booking) {
        bookingRef.current = data.booking;
        setBooking(data.booking);
      }
      setNoShowSettlementNote(
        typeof data.settlementNote === "string" ? data.settlementNote : null,
      );
      setSessionManuallyEnded(true);
    } catch {
      window.alert("Could not report no-show");
    } finally {
      setReportNoShowBusy(false);
    }
  }, [bookingId, reportNoShowBusy]);

  if (needsSignIn && !booking) {
    return (
      <>
        <SignInDialog
          open={signInOpen}
          onOpenChange={setSignInOpen}
          description="Sign in to join your Convene session."
          postSignInRedirect={sessionPath}
        />
        <div className="flex flex-1 items-center justify-center bg-[#0a1628] px-4 py-12">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white p-6 text-center shadow-xl sm:p-8">
            <p className="text-sm font-medium text-[#003049]">
              Sign in to join this session.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Use the account for this booking. After sign-in you&apos;ll return here automatically.
            </p>
            <Button
              type="button"
              className="mt-6 rounded-lg bg-[#F77F00] px-8 py-3 text-sm font-semibold text-white hover:bg-[#F77F00]/90"
              onClick={() => setSignInOpen(true)}
            >
              Sign in
            </Button>
          </div>
        </div>
      </>
    );
  }

  if (loadErr) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-sm text-red-600">{loadErr}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-[#F77F00] underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16 text-sm text-muted-foreground">
        Loading session…
      </div>
    );
  }

  if (blockedBeforeJoinWindow) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#0a1628] px-4 py-12">
        <div
          role="alert"
          className="w-full max-w-lg rounded-2xl border border-white/10 bg-white p-6 text-center shadow-xl sm:p-8"
        >
          <p className="text-sm font-medium text-[#003049]">
            Your session is not active until 10 minutes before the scheduled start time.
          </p>
          <Link
            href="/dashboard?view=sessions"
            className="mt-6 inline-flex rounded-lg bg-[#F77F00] px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#F77F00]/90"
          >
            Return to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <SessionReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        bookingId={bookingId}
        role={booking.user_role === "expert" ? "expert" : "learner"}
        partnerName={booking.partner_name ?? null}
        onSubmitted={() => {
          setViewerReviewSubmitted(true);
        }}
      />

      <WaitingRoomLateJoinDialog
        open={lateJoinDialogOpen && Boolean(waitingRoomParties)}
        variant={lateJoinDialogVariant}
        partnerName={waitingPartnerName}
        viewerRole={viewerRole}
        reportBusy={reportNoShowBusy}
        onContinueWaiting={dismissLateJoinDialog}
        onReportNoShow={() => void reportNoShow()}
      />

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        {waitingRoomParties ? (
          <div
            className="fixed inset-0 z-[35] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-waiting-room-title"
          >
            <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:max-w-2xl sm:p-8">
              <h2
                id="session-waiting-room-title"
                className="mb-6 text-center text-lg font-semibold text-[#003049] sm:text-xl"
              >
                Waiting for others to join
              </h2>
              <div className="flex flex-col gap-8 lg:flex-row lg:items-stretch lg:gap-10">
                <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 sm:items-stretch">
                  <div className="flex w-full items-center gap-4">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-gray-100">
                      {waitingRoomParties.expert.profile_photo ? (
                        <Image
                          src={waitingRoomParties.expert.profile_photo}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="64px"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-base font-semibold text-[#003049]/35">
                          {waitingRoomParties.expert.display_name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <VisibleTempDot expertVisibilityState={waitingRoomParties.expert.expert_visibility_state} />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#003049]/55">Expert</p>
                      <p className="truncate text-lg font-semibold text-[#003049]">{waitingRoomParties.expert.display_name}</p>
                      {waitingRoomParties.expert.profession ? (
                        <p className="truncate text-sm text-[#F77F00]">{waitingRoomParties.expert.profession}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex justify-center py-0.5 text-4xl font-extralight leading-none text-[#003049]/25" aria-hidden>
                    +
                  </div>

                  <div className="flex w-full items-center gap-4">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-gray-100">
                      {waitingRoomParties.learner.profile_photo ? (
                        <Image
                          src={waitingRoomParties.learner.profile_photo}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="64px"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-base font-semibold text-[#003049]/35">
                          {waitingRoomParties.learner.display_name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#003049]/55">Learner</p>
                      <p className="truncate text-lg font-semibold text-[#003049]">{waitingRoomParties.learner.display_name}</p>
                      {waitingRoomParties.learner.profession ? (
                        <p className="truncate text-sm text-[#F77F00]">{waitingRoomParties.learner.profession}</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex min-h-[220px] w-full flex-1 flex-col justify-center rounded-2xl bg-[#003049] px-6 py-6 text-left text-white lg:max-w-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/85">Session details</p>
                  {startsInWaiting ? (
                    <p
                      className={
                        startsInWaiting.variant === "late"
                          ? "mt-2 text-sm font-semibold text-red-500"
                          : "mt-2 text-sm font-semibold text-[#F77F00]"
                      }
                    >
                      {startsInWaiting.text}
                    </p>
                  ) : null}
                  <div className="mt-2.5 flex flex-col gap-2 text-sm font-medium leading-snug text-white">
                    <span className="inline-flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0 text-white/90" aria-hidden />
                      <span>{formatSessionDateCol(booking.session_date)}</span>
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0 text-white/90" aria-hidden />
                      <span className="tabular-nums">
                        {formatTimeRange(booking.session_date, booking.start_time, booking.end_time)}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Timer className="h-4 w-4 shrink-0 text-white/90" aria-hidden />
                      <span className="text-white/75">
                        Duration {formatDurationLabel(durationMin)}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="relative min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-[#0a1628]">
          {!mediaReady && !showRejoinPrompt ? (
            <div
              className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-[#0a1628] px-4 py-8"
              role="region"
              aria-label="Camera and microphone access"
            >
              {rememberedMediaAttempt && !mediaGateErr ? (
                <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-4">
                  <Loader2 className="h-8 w-8 animate-spin text-white/90" aria-hidden />
                  <p className="text-center text-sm font-medium text-white/85">
                    Requesting camera and microphone…
                  </p>
                </div>
              ) : (
                <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white p-6 shadow-xl sm:p-8">
                  <div className="flex justify-center gap-3 text-[#003049]">
                    <div className="rounded-full bg-[#003049]/8 p-3">
                      <Video className="h-7 w-7" aria-hidden />
                    </div>
                    <div className="rounded-full bg-[#003049]/8 p-3">
                      <Mic className="h-7 w-7" aria-hidden />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={mediaBusy || busy}
                    onClick={() => void requestMediaAccessThenJoin()}
                    className="mt-6 w-full rounded-xl bg-[#F77F00] px-4 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#F77F00]/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {mediaBusy ? "Requesting access…" : "Allow Camera & Microphone Use"}
                  </button>
                  {mediaGateErr === "denied" ? (
                    <p className="mt-3 text-center text-sm text-red-600" role="alert">
                      Access was blocked or dismissed. Open Troubleshoot below, then try the button again.
                    </p>
                  ) : null}
                  {mediaGateErr === "unavailable" ? (
                    <p className="mt-3 text-center text-sm text-red-600" role="alert">
                      Could not use the camera or microphone from this page. Use a secure (https) link and a supported
                      browser, or check that no other app is using your camera.
                    </p>
                  ) : null}
                  <MediaTroubleshootCollapsible className="mt-6" />
                </div>
              )}
            </div>
          ) : null}

          {!inCall && endedBySchedule ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#0a1628]/92 px-4 py-10 text-center">
              <p className="pointer-events-auto max-w-md text-sm font-medium text-white/90">
                This session&apos;s scheduled time has ended. The video room was closed automatically.
              </p>
              <Link
                href="/dashboard"
                className="pointer-events-auto rounded-lg bg-[#F77F00] px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#F77F00]/90"
              >
                Back to dashboard
              </Link>
            </div>
          ) : !inCall && sessionManuallyEnded ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#0a1628]/92 px-4 py-10 text-center">
              <p className="pointer-events-auto max-w-md text-sm font-medium text-white/90">
                This session has ended.
              </p>
              {noShowSettlementNote ? (
                <p className="pointer-events-auto max-w-md text-sm text-white/75">{noShowSettlementNote}</p>
              ) : null}
              <Link
                href="/dashboard?view=sessions"
                className="pointer-events-auto rounded-lg bg-[#F77F00] px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#F77F00]/90"
              >
                Back to dashboard
              </Link>
            </div>
          ) : !inCall && (busy || callErr || showRejoinPrompt) ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#0a1628]/90 px-4 py-10 text-center">
              {busy ? (
                <p className="text-sm font-medium text-white/85">Connecting…</p>
              ) : callErr ? (
                <>
                  <p className="pointer-events-auto max-w-md text-sm text-white/80">
                    Could not start the video call. Check your connection and try again.
                  </p>
                  <p className="pointer-events-auto text-sm text-red-300">{callErr}</p>
                  <button
                    type="button"
                    onClick={() => void startOrReconnectCall()}
                    className="pointer-events-auto rounded-lg bg-[#F77F00] px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#F77F00]/90"
                  >
                    Try again
                  </button>
                </>
              ) : (
                <>
                  <p className="pointer-events-auto max-w-md text-sm text-white/80">
                    You left the video call.
                  </p>
                  {endSessionErr ? (
                    <p className="pointer-events-auto max-w-md text-sm text-red-300" role="alert">
                      {endSessionErr}
                    </p>
                  ) : null}
                  <div className="pointer-events-auto flex flex-col items-center gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void startOrReconnectCall()}
                      disabled={endSessionBusy}
                      className="rounded-lg bg-[#F77F00] px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#F77F00]/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Rejoin call
                    </button>
                    <button
                      type="button"
                      onClick={() => void endSession()}
                      disabled={endSessionBusy || !endSessionAllowed}
                      title={
                        endSessionAllowed
                          ? undefined
                          : "End session is available once both participants have joined, or 10 minutes after the scheduled start."
                      }
                      className="rounded-lg border border-white/35 bg-white/10 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {endSessionBusy ? "Ending session…" : "End session"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          <div
            ref={containerRef}
            aria-hidden={waitingRoomParties ? true : undefined}
            className={cn(
              "absolute inset-0 z-0 bg-[#0a1628] min-h-0 min-w-0",
              waitingRoomParties && "invisible",
            )}
          />
        </div>
      </div>

      {booking.user_role === "learner" &&
      inCall &&
      liveTiming?.extend_offer_eligible &&
      liveTiming.extension_pricing &&
      !dismissExtendBar &&
      !endedBySchedule ? (
        <div
          className="fixed bottom-0 left-0 right-0 z-[36] border-t border-[#003049]/15 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur-sm sm:px-6"
          role="region"
          aria-label="Extend session offer"
        >
          <div className="mx-auto flex max-w-4xl flex-col items-end gap-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
            <p className="w-full max-w-full text-right text-sm font-semibold text-[#003049] sm:max-w-[min(100%,36rem)] sm:w-auto">
              {liveTiming.minutes_remaining != null ? (
                <>
                  Session ends in{" "}
                  <span className="font-semibold text-[#F77F00]">
                    {liveTiming.minutes_remaining}{" "}
                    {liveTiming.minutes_remaining === 1 ? "minute" : "minutes"}
                  </span>
                  . Extend 15 minutes for{" "}
                  <span className="tabular-nums">
                    ${liveTiming.extension_pricing.total_amount.toFixed(2)}
                  </span>
                  ?
                </>
              ) : (
                <>
                  Extend 15 minutes for{" "}
                  <span className="tabular-nums">
                    ${liveTiming.extension_pricing.total_amount.toFixed(2)}
                  </span>
                  ?
                </>
              )}
            </p>
            <div className="flex shrink-0 justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[#003049]/25 bg-white px-4 py-2 text-sm font-semibold text-[#003049] hover:bg-[#003049]/5"
                onClick={() => setDismissExtendBar(true)}
              >
                Hide
              </button>
              <Popover open={extendPayOpen} onOpenChange={setExtendPayOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="rounded-lg bg-[#F77F00] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#F77F00]/90"
                  >
                    Extend
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="end"
                  sideOffset={10}
                  className="z-[60] w-[min(20rem,calc(100vw-1.5rem))] border-[#003049]/12 p-4 shadow-lg"
                >
                  <SessionExtensionPaymentPanel
                    open={extendPayOpen}
                    onOpenChange={setExtendPayOpen}
                    bookingId={bookingId}
                    pricing={liveTiming?.extension_pricing ?? null}
                    onPaid={() => {
                      setEndedBySchedule(false);
                      void (async () => {
                        try {
                          const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}`);
                          const data = (await res.json()) as SessionApiResponse;
                          if (!res.ok) return;
                          if (data.booking) setBooking(data.booking);
                          if (data.live_timing) setLiveTiming(data.live_timing);
                        } catch {
                          /* ignore */
                        }
                      })();
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      ) : null}

      {booking.user_role === "expert" && inCall && expertExtendNotice ? (
        <div
          className="fixed bottom-0 left-0 right-0 z-[36] border-t border-[#003049]/15 bg-[#003049] px-4 py-3 text-white shadow-[0_-4px_20px_rgba(0,0,0,0.12)] sm:px-6"
          role="status"
        >
          <div className="mx-auto flex max-w-4xl items-start justify-between gap-3 sm:items-center">
            <p className="text-sm font-medium leading-snug">{expertExtendNotice}</p>
            <button
              type="button"
              onClick={() => setExpertExtendNotice(null)}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-white/90 underline-offset-2 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
