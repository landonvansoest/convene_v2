"use client";

import { useEffect, useState } from "react";
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
  counterpartName: string;
  /** Current user viewer role determines copy */
  viewerRole: "expert" | "learner";
  onSubmitted?: () => void;
};

export function RescheduleSessionDialog({
  open,
  onOpenChange,
  bookingId,
  toUserId,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  counterpartName,
  viewerRole,
  onSubmitted,
}: Props) {
  const [date, setDate] = useState(() => defaultDate ?? "");
  const [startTime, setStartTime] = useState(() =>
    typeof defaultStartTime === "string" && defaultStartTime.length >= 5 ? defaultStartTime.slice(0, 5) : "",
  );
  const [endTime, setEndTime] = useState(() =>
    typeof defaultEndTime === "string" && defaultEndTime.length >= 5 ? defaultEndTime.slice(0, 5) : "",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setDate(defaultDate ?? "");
    const s =
      typeof defaultStartTime === "string" && defaultStartTime.length >= 5 ? defaultStartTime.slice(0, 5) : "";
    const e =
      typeof defaultEndTime === "string" && defaultEndTime.length >= 5 ? defaultEndTime.slice(0, 5) : "";
    setStartTime(s);
    setEndTime(e);
    setErr(null);
    setRequestMessage("");
  }, [open, defaultDate, defaultStartTime, defaultEndTime]);

  async function submit() {
    if (!date || startTime.length < 3 || endTime.length < 3) {
      setErr("Pick a date, start time, and end time.");
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
      onOpenChange(false);
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const title =
    viewerRole === "expert" ? "Propose a new session time" : "Request a different session time";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#003049]">Reschedule session</DialogTitle>
          <DialogDescription>
            {title} with {counterpartName}. When you confirm, they receive a threaded message they can reply to.
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
                className={`${dashboardInputClass} rounded-md`}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
      </DialogContent>
    </Dialog>
  );
}
