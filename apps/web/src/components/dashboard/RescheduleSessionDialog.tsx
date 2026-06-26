"use client";

import { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { dashboardInputClass } from "@/app/dashboard/DashboardViewShell";
import { durationMinutesBetweenWallTimes, normalizeWallTimeForPg } from "@/lib/offers/session-time";

function hmFromTimeInput(value: string | undefined): string {
  return typeof value === "string" && value.length >= 5 ? value.slice(0, 5) : "";
}

function formatDurationLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr${h === 1 ? "" : "s"}`;
  return `${h} hr${h === 1 ? "" : "s"} ${m} min`;
}

function firstName(fullName: string): string {
  const p = fullName.trim().split(/\s+/)[0];
  return p || fullName.trim() || "your partner";
}

function addMinutesToHm(hm: string, minutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!match || !Number.isFinite(minutes)) return hm;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const nh = Math.floor(wrapped / 60);
  const nm = wrapped % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function resolveOriginalDurationMinutes(
  defaultStartTime: string | undefined,
  defaultEndTime: string | undefined,
  defaultDurationMinutes: number | undefined,
): number | null {
  const startPg = normalizeWallTimeForPg(defaultStartTime);
  const endPg = normalizeWallTimeForPg(defaultEndTime);
  if (startPg && endPg) {
    const fromTimes = durationMinutesBetweenWallTimes(startPg, endPg);
    if (fromTimes != null && fromTimes > 0) return fromTimes;
  }
  if (
    defaultDurationMinutes != null &&
    Number.isFinite(defaultDurationMinutes) &&
    defaultDurationMinutes > 0
  ) {
    return Math.round(defaultDurationMinutes);
  }
  return null;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Booking UUID */
  bookingId: string;
  /** Other party UUID (recipient of the reschedule proposal). */
  toUserId: string;
  /** Default date YYYY-MM-DD from current booking */
  defaultDate: string | undefined;
  defaultStartTime: string | undefined;
  defaultEndTime: string | undefined;
  /** Fallback when start/end times are missing from the booking row. */
  defaultDurationMinutes?: number;
  counterpartName: string;
  /** Current user viewer role determines copy */
  viewerRole: "expert" | "learner";
  onSubmitted?: () => void;
};

type Step = "form" | "success";

export function RescheduleSessionDialog({
  open,
  onOpenChange,
  bookingId,
  toUserId,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  defaultDurationMinutes,
  counterpartName,
  viewerRole,
  onSubmitted,
}: Props) {
  const originalDurationMinutes = resolveOriginalDurationMinutes(
    defaultStartTime,
    defaultEndTime,
    defaultDurationMinutes,
  );
  const durationLabel =
    originalDurationMinutes != null ? formatDurationLabel(originalDurationMinutes) : "scheduled";
  const counterpartFirstName = firstName(counterpartName);

  const [step, setStep] = useState<Step>("form");
  const [date, setDate] = useState(() => defaultDate ?? "");
  const [startTime, setStartTime] = useState(() => hmFromTimeInput(defaultStartTime));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState("");

  const endTime =
    originalDurationMinutes != null && startTime.length >= 4
      ? addMinutesToHm(startTime, originalDurationMinutes)
      : hmFromTimeInput(defaultEndTime);

  useEffect(() => {
    if (!open) return;
    setStep("form");
    setDate(defaultDate ?? "");
    setStartTime(hmFromTimeInput(defaultStartTime));
    setErr(null);
    setRequestMessage("");
  }, [open, defaultDate, defaultStartTime]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setStep("form");
    onOpenChange(nextOpen);
  }

  async function submit() {
    if (!date || startTime.length < 3 || endTime.length < 3) {
      setErr("Pick a date and start time.");
      return;
    }
    if (originalDurationMinutes == null) {
      setErr("Could not determine the original session duration.");
      return;
    }
    setBusy(true);
    setErr(null);
    const startHm = `${startTime.padStart(5, "0")}:00`;
    const endHm = `${endTime.padStart(5, "0")}:00`;

    const canned =
      viewerRole === "expert"
        ? `I'd like to propose a different time for our session (${counterpartName}), pending your confirmation.`
        : `I'd like to request a different time for our session.`;
    const trimmed = requestMessage.trim();
    const companion = trimmed.length > 0 ? `${canned}\n\n${trimmed}` : canned;

    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId,
          offerType: "time_suggestion",
          relatedBookingId: bookingId,
          payload: {
            proposed_session_date: date,
            start_time: startHm,
            end_time: endHm,
          },
          companionMessage: companion,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Couldn't send reschedule proposal");
        return;
      }
      onSubmitted?.();
      setStep("success");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {step === "success" ? (
          <div className="space-y-4 py-2">
            <DialogTitle className="flex items-center gap-2 text-[#003049]">
              <CheckCircle className="h-6 w-6 shrink-0 text-[#F77F00]" aria-hidden />
              Your Proposal has been sent
            </DialogTitle>
            <p className="text-sm leading-relaxed text-[#003049]/80">
              Note that the session will remain as scheduled until {counterpartName} accepts your proposal.
              If the proposal is accepted, the booking time will change in your dashboard. If the proposal is
              declined, the booking will be canceled and refunded.
            </p>
            <Button
              type="button"
              className="w-full bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-[#003049]">Reschedule session</DialogTitle>
              <DialogDescription className="space-y-2 text-sm leading-relaxed text-[#003049]/80">
                <span className="block">
                  Propose a new time for your {durationLabel} session with {counterpartName}.
                </span>
                <span className="block">
                  Note that the session will remain scheduled at the original time until{" "}
                  {counterpartFirstName} accepts the new schedule.
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <label className="grid gap-1 text-sm font-medium text-[#003049]">
                Day
                <input
                  type="date"
                  className={`${dashboardInputClass} rounded-md`}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm font-medium text-[#003049]">
                  Start
                  <input
                    type="time"
                    className={`${dashboardInputClass} rounded-md`}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-[#003049]">
                  End
                  <input
                    type="time"
                    readOnly
                    tabIndex={-1}
                    aria-readonly="true"
                    className={`${dashboardInputClass} cursor-not-allowed rounded-md bg-muted/40 text-[#003049]/80`}
                    value={endTime}
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium text-[#003049]">
                Message
                <Textarea
                  value={requestMessage}
                  maxLength={8000}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  placeholder="Add a note to include with your reschedule request (optional)…"
                  rows={4}
                  className={`${dashboardInputClass} min-h-[5rem] resize-y rounded-md`}
                />
              </label>
              {err ? <p className="text-sm text-red-600">{err}</p> : null}
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
                disabled={busy}
                onClick={() => void submit()}
              >
                {busy ? "Sending…" : "Send proposal"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
