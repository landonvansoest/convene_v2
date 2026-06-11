"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle, Mail } from "lucide-react";
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
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBackToSignIn: () => void;
  initialEmail?: string;
};

export function ForgotPasswordDialog({ open, onOpenChange, onBackToSignIn, initialEmail = "" }: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open && !sent) setEmail(initialEmail);
  }, [open, initialEmail, sent]);

  function closeAll() {
    setSent(false);
    setErr(null);
    setEmail(initialEmail);
    onOpenChange(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) closeAll();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {sent ? (
          <>
            <DialogHeader>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-10 w-10 text-emerald-600" />
              </div>
              <DialogTitle className="text-center text-xl font-bold text-[#003049]">Check your email</DialogTitle>
              <DialogDescription className="text-center">
                We sent a reset link to <strong>{email}</strong>. Open it to set a new password.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setSent(false);
                  setErr(null);
                  onBackToSignIn();
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to sign in
              </Button>
              <Button type="button" variant="ghost" className="flex-1" onClick={closeAll}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-[#003049]">Reset password</DialogTitle>
              <DialogDescription>We&apos;ll email you a link to choose a new password (v1-style flow).</DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="fp-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="fp-email"
                    type="email"
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>
              {err ? <p className="text-sm text-destructive">{err}</p> : null}
              <Button type="submit" className="w-full bg-[#003049] text-white" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  onBackToSignIn();
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to sign in
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
