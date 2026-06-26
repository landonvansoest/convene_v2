"use client";

import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RescheduleSessionDialog } from "@/components/dashboard/RescheduleSessionDialog";
import { formatSessionDate, formatSessionTime } from "@/lib/notifications/booking-template-vars";
import { cn } from "@/lib/utils";

export type ThreadMessageWithOffer = {
  id: string;
  sender_id: string;
  sender_name?: string | null;
  message_body: string;
  created_at?: string;
  offer_id?: string | null;
  offer_type?: string | null;
  offer_status?: string | null;
  offer_payload?: Record<string, unknown> | null;
};

type RescheduleBookingContext = {
  bookingId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
  viewerRole: "expert" | "learner";
  counterpartName: string;
  toUserId: string;
};

type AcceptedSchedule = {
  dateLabel: string;
  timeLabel: string;
};

type Props = {
  message: ThreadMessageWithOffer;
  viewerUserId: string | null | undefined;
  variant: "mineSolid" | "mineMuted" | "theirs";
  onThreadChanged?: () => void | Promise<void>;
  onAcceptPayment?: (bookingId: string) => void;
};

function durationMinutesFromBooking(duration: unknown): number | undefined {
  const s = String(duration ?? "").trim();
  const m = s.match(/^(\d+)\s*minutes?$/i);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  return undefined;
}

function relatedBookingId(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;
  const id = payload.related_booking_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function scheduleFromOfferPayload(payload: Record<string, unknown> | null | undefined): AcceptedSchedule | null {
  if (!payload) return null;
  const dateRaw = payload.proposed_session_date ?? payload.session_date;
  const sessionDate = typeof dateRaw === "string" ? dateRaw.trim() : "";
  const startTime = typeof payload.start_time === "string" ? payload.start_time : "";
  const endTime = typeof payload.end_time === "string" ? payload.end_time : "";
  if (!sessionDate || !startTime || !endTime) return null;
  return {
    dateLabel: formatSessionDate(sessionDate, startTime),
    timeLabel: `${formatSessionTime(sessionDate, startTime)} – ${formatSessionTime(sessionDate, endTime)}`,
  };
}

function scheduleFromApiResponse(data: {
  sessionDate?: string;
  startTime?: string;
  endTime?: string;
}): AcceptedSchedule | null {
  const sessionDate = typeof data.sessionDate === "string" ? data.sessionDate.trim() : "";
  const startTime = typeof data.startTime === "string" ? data.startTime : "";
  const endTime = typeof data.endTime === "string" ? data.endTime : "";
  if (!sessionDate || !startTime || !endTime) return null;
  return {
    dateLabel: formatSessionDate(sessionDate, startTime),
    timeLabel: `${formatSessionTime(sessionDate, startTime)} – ${formatSessionTime(sessionDate, endTime)}`,
  };
}

export function RescheduleOfferMessageActions({
  message,
  viewerUserId,
  variant,
  onThreadChanged,
  onAcceptPayment,
}: Props) {
  const oid = message.offer_id;
  const status = message.offer_status;
  const viewerIsRecipient = Boolean(viewerUserId && message.sender_id !== viewerUserId);
  const isTimeSuggestion = message.offer_type === "time_suggestion";
  const show = typeof oid === "string" && viewerIsRecipient && status === "offered";

  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [declineConfirmOpen, setDeclineConfirmOpen] = useState(false);
  const [acceptSuccessOpen, setAcceptSuccessOpen] = useState(false);
  const [acceptedSchedule, setAcceptedSchedule] = useState<AcceptedSchedule | null>(null);
  const [rescheduleCtx, setRescheduleCtx] = useState<RescheduleBookingContext | null>(null);

  if (!show) return null;

  async function respond(action: "accept" | "decline") {
    if (!oid || busy) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/offers/${encodeURIComponent(oid)}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as {
        error?: string;
        status?: string;
        bookingId?: string;
        requiresPayment?: boolean;
        sessionDate?: string;
        startTime?: string;
        endTime?: string;
      };
      if (!res.ok) {
        window.alert(typeof data.error === "string" ? data.error : "Could not update offer");
        return;
      }
      if (
        action === "accept" &&
        data.requiresPayment &&
        typeof data.bookingId === "string" &&
        data.bookingId
      ) {
        onAcceptPayment?.(data.bookingId);
      }
      if (action === "accept" && isTimeSuggestion) {
        const schedule =
          scheduleFromApiResponse(data) ?? scheduleFromOfferPayload(message.offer_payload);
        if (schedule) {
          setAcceptedSchedule(schedule);
          setAcceptSuccessOpen(true);
        }
      }
      await onThreadChanged?.();
    } catch {
      window.alert("Network error.");
    } finally {
      setBusy(null);
      if (action === "decline") setDeclineConfirmOpen(false);
    }
  }

  function handleDeclineClick() {
    if (isTimeSuggestion && relatedBookingId(message.offer_payload)) {
      setDeclineConfirmOpen(true);
      return;
    }
    void respond("decline");
  }

  async function openSuggest() {
    const bookingId = relatedBookingId(message.offer_payload);
    if (!bookingId) {
      window.alert("Could not find the booking linked to this offer.");
      return;
    }
    if (!message.sender_id || loadingSuggest) return;
    setLoadingSuggest(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}`);
      const data = (await res.json()) as {
        error?: string;
        booking?: {
          session_date?: string;
          start_time?: string;
          end_time?: string;
          duration?: unknown;
          user_role?: string;
          partner_name?: string | null;
          partner_id?: string | null;
        };
      };
      if (!res.ok || !data.booking) {
        window.alert(typeof data.error === "string" ? data.error : "Could not load booking");
        return;
      }
      const b = data.booking;
      const role = String(b.user_role ?? "").toLowerCase();
      const partnerId =
        typeof b.partner_id === "string" && b.partner_id.trim()
          ? b.partner_id.trim()
          : message.sender_id;
      setRescheduleCtx({
        bookingId,
        sessionDate: String(b.session_date ?? ""),
        startTime: String(b.start_time ?? ""),
        endTime: String(b.end_time ?? ""),
        durationMinutes: durationMinutesFromBooking(b.duration),
        viewerRole: role === "expert" ? "expert" : "learner",
        counterpartName:
          message.sender_name?.trim() || b.partner_name?.trim() || "your partner",
        toUserId: partnerId,
      });
      setSuggestOpen(true);
    } catch {
      window.alert("Network error.");
    } finally {
      setLoadingSuggest(false);
    }
  }

  function handleSuggestSubmitted() {
    /* Thread refresh runs when the dialog closes — avoids unmounting mid-success. */
  }

  function handleSuggestOpenChange(open: boolean) {
    setSuggestOpen(open);
    if (!open) {
      void onThreadChanged?.();
    }
  }

  const solidMine = variant === "mineSolid";
  const mutedMine = variant === "mineMuted";
  const theirsLike = variant === "theirs" || mutedMine;

  const outlineBtnClass = cn(
    "h-8 px-3 text-xs font-semibold",
    solidMine &&
      "!border-white/55 bg-transparent text-white hover:bg-white/15 hover:!text-white",
    !solidMine &&
      theirsLike &&
      "!border-[#003049]/25 bg-white text-[#003049] hover:bg-[#003049]/5",
  );

  return (
    <>
      <Dialog open={declineConfirmOpen} onOpenChange={setDeclineConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#003049]">Decline reschedule?</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-[#003049]/80">
            Declining this reschedule proposal will cancel this session and a full refund will be
            issued. You can also click &ldquo;Suggest&rdquo; to propose a new time that works better
            for you.
          </p>
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="border-[#003049]/20 text-[#003049]"
              disabled={busy === "decline"}
              onClick={() => setDeclineConfirmOpen(false)}
            >
              Go back
            </Button>
            <Button
              type="button"
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={busy === "decline"}
              onClick={() => void respond("decline")}
            >
              {busy === "decline" ? "…" : "Confirm cancellation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={acceptSuccessOpen} onOpenChange={setAcceptSuccessOpen}>
        <DialogContent className="max-w-md">
          <div className="space-y-4 py-2">
            <DialogTitle className="flex items-center gap-2 text-[#003049]">
              <CheckCircle className="h-6 w-6 shrink-0 text-[#F77F00]" aria-hidden />
              Reschedule accepted
            </DialogTitle>
            <p className="text-sm leading-relaxed text-[#003049]/80">
              Your session has been updated to the new time:
            </p>
            {acceptedSchedule ? (
              <div className="rounded-md border border-[#003049]/10 bg-gray-50/80 px-3 py-2 text-sm text-[#003049]">
                <p className="font-semibold">{acceptedSchedule.dateLabel}</p>
                <p className="mt-1 text-[#003049]/80">{acceptedSchedule.timeLabel}</p>
              </div>
            ) : null}
            <Button
              type="button"
              className="w-full bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
              onClick={() => setAcceptSuccessOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {rescheduleCtx ? (
        <RescheduleSessionDialog
          open={suggestOpen}
          onOpenChange={handleSuggestOpenChange}
          bookingId={rescheduleCtx.bookingId}
          toUserId={rescheduleCtx.toUserId}
          defaultDate={rescheduleCtx.sessionDate || undefined}
          defaultStartTime={rescheduleCtx.startTime || undefined}
          defaultEndTime={rescheduleCtx.endTime || undefined}
          defaultDurationMinutes={rescheduleCtx.durationMinutes}
          counterpartName={rescheduleCtx.counterpartName}
          viewerRole={rescheduleCtx.viewerRole}
          onSubmitted={handleSuggestSubmitted}
        />
      ) : null}

      <div
        className={cn(
          "mt-3 flex flex-wrap gap-2 border-t pt-3",
          solidMine ? "border-white/25" : "border-[#003049]/12",
        )}
      >
        <Button
          type="button"
          size="sm"
          className={cn(
            "h-8 border-0 px-3 text-xs font-semibold shadow-none",
            solidMine && "bg-white text-[#F77F00] hover:bg-white/90",
            !solidMine && theirsLike && "bg-[#F77F00] text-white hover:bg-[#F77F00]/90",
          )}
          disabled={busy !== null || loadingSuggest}
          onClick={() => void respond("accept")}
        >
          {busy === "accept" ? "…" : "Accept"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={outlineBtnClass}
          disabled={busy !== null || loadingSuggest}
          onClick={handleDeclineClick}
        >
          {busy === "decline" ? "…" : "Decline"}
        </Button>
        {isTimeSuggestion ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={outlineBtnClass}
            disabled={busy !== null || loadingSuggest}
            onClick={() => void openSuggest()}
          >
            {loadingSuggest ? "…" : "Suggest"}
          </Button>
        ) : null}
      </div>
    </>
  );
}
