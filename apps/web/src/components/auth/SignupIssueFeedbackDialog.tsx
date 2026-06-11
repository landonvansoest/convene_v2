"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled from the signup form so the visitor doesn't have to re-enter it. */
  initialEmail?: string;
  /** Raw Supabase error context passed through to admins via /api/user-feedback/signup-issue. */
  errorContext?: {
    status?: number;
    code?: string;
    message?: string;
  };
};

export function SignupIssueFeedbackDialog({
  open,
  onOpenChange,
  initialEmail = "",
  errorContext,
}: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(initialEmail);
      setMessage("");
      setErr(null);
      setSubmitted(false);
      setBusy(false);
    }
  }, [open, initialEmail]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setErr("Please enter a valid email address.");
      return;
    }
    if (message.trim().length < 1) {
      setErr("Please tell us what went wrong.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/user-feedback/signup-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          message: message.trim(),
          error_status: errorContext?.status,
          error_code: errorContext?.code,
          error_message: errorContext?.message,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const msg =
          typeof body?.error === "string" ? body.error : "Could not send your message. Please try again.";
        setErr(msg);
        setBusy(false);
        return;
      }
      setSubmitted(true);
      setBusy(false);
    } catch {
      setErr("Could not send your message. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-[#003049]/15 bg-white p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-left text-[#003049]">
            {submitted ? "Message sent" : "Contact the admin"}
          </DialogTitle>
          <DialogDescription className="text-left text-[#003049]/80">
            {submitted
              ? "Thanks — we received your message and will get back to you at the email you provided."
              : "Sorry you're having trouble creating an account. Share what happened and we'll look into it."}
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
            >
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signup-issue-email" className="text-[#003049]">
                Your email
              </Label>
              <Input
                id="signup-issue-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11 border-[#003049]/25 bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-issue-message" className="text-[#003049]">
                What happened?
              </Label>
              <textarea
                id="signup-issue-message"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                placeholder="Describe the error you ran into. Include anything else that might help us fix it."
                className="w-full rounded-md border border-[#003049]/20 bg-white px-3 py-2 text-sm text-[#003049] outline-none placeholder:text-[#003049]/45 focus:border-[#F77F00]"
              />
            </div>
            {errorContext?.message ? (
              <p className="text-[11px] leading-snug text-[#003049]/60">
                Technical details (sent with your message):{" "}
                <span className="font-mono">
                  {errorContext.status ? `${errorContext.status} ` : ""}
                  {errorContext.code ?? errorContext.message}
                </span>
              </p>
            ) : null}
            {err ? <p className="text-sm text-red-600">{err}</p> : null}
            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-[#F77F00] text-white hover:bg-[#F77F00]/90"
            >
              {busy ? "Sending…" : "Send to admin"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
