"use client";

import { FormEvent, useEffect, useState } from "react";
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
  action: "approve" | "decline" | null;
  partnerName: string;
  bookingId: string | null;
  onCompleted?: () => void;
};

export function BookingRequestRespondDialog({
  open,
  onOpenChange,
  action,
  partnerName,
  bookingId,
  onCompleted,
}: Props) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMessage("");
      setErr(null);
      setBusy(false);
    }
  }, [open, action, bookingId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!bookingId || !action) return;
    const trimmed = message.trim();
    if (!trimmed) {
      setErr("Please add a message for your learner.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}/respond-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, message: trimmed }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Could not send response");
      return;
    }
    onOpenChange(false);
    onCompleted?.();
  }

  const title =
    action === "approve" ? "Approve booking request" : action === "decline" ? "Decline booking request" : "Respond";

  const description =
    action === "approve"
      ? `Send ${partnerName} a message confirming the session. We'll include a link to complete payment.`
      : action === "decline"
        ? `Send ${partnerName} a brief message explaining why you're declining this request.`
        : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={(e) => void onSubmit(e)}>
          <DialogHeader>
            <DialogTitle className="text-[#003049]">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                action === "approve"
                  ? "Great — looking forward to our session!"
                  : "Sorry, I'm not available at that time."
              }
              rows={4}
              className={dashboardInputClass}
              disabled={busy}
              required
            />
            {err ? <p className="text-sm text-destructive">{err}</p> : null}
          </div>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !action}
              className={
                action === "decline"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-convene-primary text-white hover:bg-convene-primary/90"
              }
            >
              {busy ? "Sending…" : action === "approve" ? "Approve & send message" : "Decline & send message"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
