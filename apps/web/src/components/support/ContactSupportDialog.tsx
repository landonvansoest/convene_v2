"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type SubmittedTicket = { ticket_id: string } | null;

/**
 * In-app "Contact Us" / Help Ticket dialog. Authed users get a streamlined
 * one-field form (subject + body); guests must also provide email + name.
 * Replies from admins arrive by email and link back to /help/[ticketId].
 */
export function ContactSupportDialog({ open, onOpenChange }: Props) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestName, setGuestName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedTicket>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    try {
      const sb = createBrowserSupabase();
      void sb.auth.getUser().then(({ data }) => {
        if (cancelled) return;
        setSignedIn(!!data.user);
        setSignedInEmail(data.user?.email ?? null);
      });
    } catch {
      setSignedIn(false);
    }
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    // Reset everything when the dialog closes so reopening starts clean.
    setSubject("");
    setBodyText("");
    setGuestEmail("");
    setGuestName("");
    setSubmitError(null);
    setSubmitting(false);
    setSubmitted(null);
  }, [open]);

  const canSubmit = useMemo(() => {
    if (!subject.trim() || !bodyText.trim()) return false;
    if (signedIn) return true;
    return guestEmail.trim().length > 3 && guestEmail.includes("@");
  }, [subject, bodyText, signedIn, guestEmail]);

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        subject: subject.trim(),
        body: bodyText.trim(),
        context: { source: "footer_contact_us", url: typeof window !== "undefined" ? window.location.href : null },
      };
      if (!signedIn) {
        payload.email = guestEmail.trim();
        if (guestName.trim()) payload.name = guestName.trim();
      }
      const res = await fetch("/api/help-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          typeof data?.error === "string"
            ? data.error
            : "We couldn't submit your ticket. Please try again.";
        setSubmitError(msg);
        return;
      }
      setSubmitted({ ticket_id: String(data.ticket_id) });
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {submitted ? "Thank you for contacting Convene Support" : "Contact Convene Support"}
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-3 py-2 text-sm">
            <div className="flex items-center gap-2 text-[#F77F00]">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-medium">Your message has been received.</p>
            </div>
            <p className="text-muted-foreground">
              We will respond as soon as possible to{" "}
              <span className="font-medium text-foreground">
                {signedIn ? signedInEmail : guestEmail.trim()}
              </span>
              . You can also follow the conversation through the inbox on your dashboard.
            </p>
            <div className="flex gap-2 pt-1">
              <Button asChild className="bg-convene-primary text-white hover:bg-convene-primary/90">
                <Link href="/dashboard?view=inbox">Go to dashboard</Link>
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-1 text-sm">
            <p className="text-muted-foreground">
              Send us a message and a Convene admin will reply by email. Replies to
              that email are not monitored — please continue the conversation in
              Convene.
            </p>

            {signedIn === false ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="support-email">Your email</Label>
                  <Input
                    id="support-email"
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="support-name">Your name (optional)</Label>
                  <Input
                    id="support-name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    autoComplete="name"
                    placeholder="First Last"
                  />
                </div>
              </div>
            ) : signedIn === true && signedInEmail ? (
              <p className="text-xs text-muted-foreground">
                Reply email: <span className="font-medium text-foreground">{signedInEmail}</span>
              </p>
            ) : null}

            <div>
              <Label htmlFor="support-subject">Subject</Label>
              <Input
                id="support-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What can we help with?"
                maxLength={200}
                required
              />
            </div>
            <div>
              <Label htmlFor="support-body">Details</Label>
              <Textarea
                id="support-body"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Add as much detail as you can — bookings involved, links, error messages, etc."
                rows={6}
                maxLength={8000}
                required
              />
            </div>

            {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={!canSubmit || submitting}
                className="bg-convene-primary text-white hover:bg-convene-primary/90"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                  </>
                ) : (
                  "Send"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
