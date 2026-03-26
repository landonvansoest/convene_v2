"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { LogIn } from "lucide-react";
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
  description?: string | null;
  onRequestSignUp?: () => void;
  /** After email/password sign-in only; magic link still follows Supabase callback. */
  postSignInRedirect?: string | null;
};

export function SignInDialog({ open, onOpenChange, description, onRequestSignUp, postSignInRedirect }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [forgotOpen, setForgotOpen] = useState(false);

  function resetFields() {
    setMessage(null);
    setMode("password");
    setForgotOpen(false);
  }

  async function onPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    onOpenChange(false);
    resetFields();
    router.replace(postSignInRedirect?.trim() || "/dashboard");
    router.refresh();
  }

  async function onMagicLink(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMessage(null);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Check your email for the sign-in link.");
  }

  return (
    <>
    <ForgotPasswordDialog
      open={forgotOpen}
      onOpenChange={setForgotOpen}
      initialEmail={email}
      onBackToSignIn={() => setForgotOpen(false)}
    />
    <Dialog
      open={open && !forgotOpen}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetFields();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-[#003049]">
            <LogIn className="h-5 w-5 text-primary" />
            Sign in to Convene
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-left text-muted-foreground">
              {description ? <p className="text-foreground/90">{description}</p> : null}
              <p>
                Email and password, or a magic link. You can also use the full page at{" "}
                <Link href="/login" className="font-medium text-primary underline underline-offset-2">
                  /login
                </Link>
                .
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            className="text-sm"
            disabled
            title="Enable Google in Supabase Auth + redirect URLs, then wire signInWithOAuth."
          >
            Google
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-sm"
            disabled
            title="Enable Facebook in Supabase Auth, then wire signInWithOAuth."
          >
            Facebook
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-sm"
            disabled
            title="Enable Apple in Supabase Auth, then wire signInWithOAuth."
          >
            Apple
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Social buttons: Google, Facebook, Apple only (owner decision). Enable in Supabase and wire OAuth in code — see operator checklist §10.
        </p>

        <div className="flex gap-2 rounded-lg border border-border p-1">
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === "password" ? "bg-[#003049] text-white" : "text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => setMode("password")}
          >
            Password
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === "magic" ? "bg-[#003049] text-white" : "text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => setMode("magic")}
          >
            Magic link
          </button>
        </div>

        {mode === "password" ? (
          <form onSubmit={(e) => void onPassword(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signin-email">Email</Label>
              <Input
                id="signin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signin-password">Password</Label>
              <Input
                id="signin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {message ? <p className="text-sm text-destructive">{message}</p> : null}
            <Button type="submit" className="w-full bg-[#F77F00] text-white hover:bg-[#F77F00]/90" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-center text-sm">
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => setForgotOpen(true)}
              >
                Forgot password?
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={(e) => void onMagicLink(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="magic-email">Email</Label>
              <Input
                id="magic-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {message ? (
              <p className={message.startsWith("Check") ? "text-sm text-emerald-600" : "text-sm text-destructive"}>
                {message}
              </p>
            ) : null}
            <Button type="submit" className="w-full" variant="secondary" disabled={busy}>
              {busy ? "Sending…" : "Send magic link"}
            </Button>
          </form>
        )}

        <div className="border-t pt-4 text-center text-sm text-muted-foreground">
          <p>Need an account?</p>
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full border-[#003049] text-[#003049] hover:bg-[#003049]/5"
            onClick={() => {
              onOpenChange(false);
              resetFields();
              onRequestSignUp?.();
            }}
          >
            Create account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
