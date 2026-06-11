"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type SessionIssueFeedbackType =
  | "session_technical_interruption"
  | "expert_late_to_join"
  | "learner_late_to_join"
  | "expert_did_not_join_session"
  | "learner_did_not_join_session";

const TYPE_VALUES: SessionIssueFeedbackType[] = [
  "session_technical_interruption",
  "expert_late_to_join",
  "learner_late_to_join",
  "expert_did_not_join_session",
  "learner_did_not_join_session",
];

function labelForType(t: SessionIssueFeedbackType): string {
  switch (t) {
    case "session_technical_interruption":
      return "My session was interrupted by technical issues";
    case "expert_late_to_join":
      return "Expert was late to join";
    case "learner_late_to_join":
      return "Learner was late to join";
    case "expert_did_not_join_session":
      return "Expert did not join the booked session";
    case "learner_did_not_join_session":
      return "Learner did not join the booked session";
    default:
      return t;
  }
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string | null;
  /** Who the current user is in the booking — determines which partner-specific options apply. */
  viewerRole: "learner" | "expert";
};

export function SessionIssueFeedbackDialog({ open, onOpenChange, bookingId, viewerRole }: Props) {
  const [feedbackType, setFeedbackType] = useState<SessionIssueFeedbackType>("session_technical_interruption");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const options = useMemo((): SessionIssueFeedbackType[] => {
    if (viewerRole === "learner") {
      return TYPE_VALUES.filter(
        (t) =>
          t === "session_technical_interruption" ||
          t === "expert_late_to_join" ||
          t === "expert_did_not_join_session",
      );
    }
    return TYPE_VALUES.filter(
      (t) =>
        t === "session_technical_interruption" ||
        t === "learner_late_to_join" ||
        t === "learner_did_not_join_session",
    );
  }, [viewerRole]);

  useEffect(() => {
    if (!open) {
      setText("");
      setErr(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && options.length && !options.includes(feedbackType)) {
      setFeedbackType(options[0]);
    }
  }, [open, options, feedbackType]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!bookingId?.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/user-feedback/session-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: bookingId.trim(),
        feedback_type: feedbackType,
        feedback_text: text.trim(),
      }),
    });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Could not submit feedback");
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-[#003049]/15 bg-white p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-left text-[#003049]">Session feedback</DialogTitle>
          <DialogDescription className="text-left text-[#003049]/80">
            We&apos;re sorry you had an issue with your booking. Please provide details below.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="session-issue-type" className="text-[#003049]">
              What happened?
            </Label>
            <select
              id="session-issue-type"
              className="w-full rounded-md border border-[#003049]/20 bg-white px-3 py-2 text-sm text-[#003049] outline-none focus:border-[#F77F00]"
              value={feedbackType}
              onChange={(e) => setFeedbackType(e.target.value as SessionIssueFeedbackType)}
            >
              {options.map((t) => (
                <option key={t} value={t}>
                  {labelForType(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="session-issue-text" className="text-[#003049]">
              Details
            </Label>
            <textarea
              id="session-issue-text"
              rows={5}
              placeholder="Please provide details."
              className="w-full rounded-md border border-[#003049]/20 bg-white px-3 py-2 text-sm text-[#003049] outline-none placeholder:text-[#003049]/45 focus:border-[#F77F00]"
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
            />
          </div>
          {err ? <p className="text-sm text-red-600">{err}</p> : null}
          <Button
            type="submit"
            disabled={busy || !bookingId}
            className="w-full bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
          >
            {busy ? "Submitting…" : "Submit"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
