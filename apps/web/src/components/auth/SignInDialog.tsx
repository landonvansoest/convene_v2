"use client";

import { FormEvent, useMemo, useState } from "react";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { OAuthDivider, OAuthProviderRow } from "@/components/auth/oauth-social";
import { Eye, EyeOff, Lock, LogIn, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { resolvePostSignInPath } from "@/lib/auth/learner-registration";
import { withAuthTimeout } from "@/lib/auth/auth-call-timeout";
import { authCallbackUrl } from "@/lib/auth/post-sign-in-redirect";
import { authCallbackWithSignupWizard } from "@/lib/auth/post-signup-redirect";
import { isEmailNotConfirmedAuthError } from "@/lib/auth/email-not-confirmed";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description?: string | null;
  onRequestSignUp?: () => void;
  postSignInRedirect?: string | null;
};

export function SignInDialog({ open, onOpenChange, description, onRequestSignUp, postSignInRedirect }: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [forgotOpen, setForgotOpen] = useState(false);

  const emailNotConfirmed = isEmailNotConfirmedAuthError(message);

  function resetFields() {
    setMessage(null);
    setResendStatus("idle");
    setForgotOpen(false);
    setShowPassword(false);
  }

  async function resendConfirmationEmail() {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      setMessage("Enter your email address above, then resend the confirmation email.");
      return;
    }
    setResendStatus("sending");
    setMessage(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: trimmed,
      options: {
        emailRedirectTo: authCallbackWithSignupWizard(window.location.origin),
      },
    });
    if (error) {
      setResendStatus("error");
      setMessage(error.message);
      return;
    }
    setResendStatus("sent");
  }

  async function onPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await withAuthTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
        { label: "Sign in" },
      );
      if (error) {
        setMessage(error.message);
        return;
      }
      onOpenChange(false);
      resetFields();
      const destination = await resolvePostSignInPath(postSignInRedirect);
      // Full navigation ensures auth cookies are synced before the registration wizard loads.
      window.location.assign(destination);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function oauthSignIn(provider: "google" | "facebook" | "apple") {
    setBusy(true);
    setMessage(null);
    const redirectTo = authCallbackUrl(window.location.origin, postSignInRedirect);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    setBusy(false);
    if (error) setMessage(error.message);
  }

  const inputIconClass = "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#F77F00]";
  const inputPadLeft = "pl-10";

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
        <DialogContent className="gap-0 overflow-hidden border border-border/80 bg-background p-0 sm:max-w-[420px] sm:rounded-xl">
          <DialogHeader className="space-y-3 px-6 pb-2 pt-6">
            <DialogTitle className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-[#003049]">
              <LogIn className="h-6 w-6 shrink-0 text-[#F77F00]" />
              Sign In to Convene
            </DialogTitle>
            {description ? (
              <DialogDescription className="text-left text-sm text-foreground/80">{description}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">Sign in with email and password or a social account.</DialogDescription>
            )}
          </DialogHeader>

          <div className="px-6 pb-6 pt-2">
            <form onSubmit={(e) => void onPassword(e)} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="signin-email" className="sr-only">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className={inputIconClass} />
                  <Input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    placeholder="Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={cn(
                      inputPadLeft,
                      "h-11 rounded-lg border-[#003049]/25 bg-background focus-visible:border-[#F77F00] focus-visible:ring-[#F77F00]/30",
                    )}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password" className="sr-only">
                  Password
                </Label>
                <div className="relative">
                  <Lock className={inputIconClass} />
                  <Input
                    id="signin-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={cn(
                      inputPadLeft,
                      "h-11 rounded-lg border-[#003049]/25 bg-background pr-10 focus-visible:border-[#F77F00] focus-visible:ring-[#F77F00]/30",
                    )}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {message ? (
                <div className="space-y-1.5">
                  <p className="text-sm text-destructive">{message}</p>
                  {emailNotConfirmed ? (
                    <div className="space-y-2 rounded-lg border border-[#F77F00]/30 bg-[#FFF6EE]/60 px-3 py-2.5">
                      <p className="text-xs leading-snug text-[#003049]/85">
                        Your account exists but your email isn&apos;t verified yet. Open the confirmation link
                        from your inbox in the <strong>same browser</strong> where you signed up (not your
                        phone&apos;s in-app mail viewer if you signed up on desktop). Then sign in again.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-full border-[#F77F00]/50 text-xs font-semibold text-[#003049]"
                        disabled={busy || resendStatus === "sending"}
                        onClick={() => void resendConfirmationEmail()}
                      >
                        {resendStatus === "sending"
                          ? "Sending…"
                          : resendStatus === "sent"
                            ? "Confirmation email sent — check your inbox"
                            : "Resend confirmation email"}
                      </Button>
                    </div>
                  ) : /invalid login credentials|invalid email or password/i.test(message) ? (
                    <p className="text-xs leading-snug text-muted-foreground">
                      If you first signed up with Google or another social button, use that below—email/password
                      won&apos;t work until you add a password. Otherwise use &quot;Forgot your password?&quot; to
                      reset it.
                    </p>
                  ) : null}
                </div>
              ) : resendStatus === "sent" ? (
                <p className="text-sm text-emerald-700">
                  Confirmation email sent. Open the link in the same browser where you signed up, then sign in.
                </p>
              ) : null}
              <div className="space-y-1">
                <Button
                  type="submit"
                  className="h-11 w-full rounded-lg bg-convene-primary text-base font-semibold text-white hover:bg-convene-primary/90"
                  disabled={busy}
                >
                  {busy ? "Signing in…" : "Sign In"}
                </Button>
                <p className="text-center leading-tight">
                  <button
                    type="button"
                    className="text-sm font-medium text-[#F77F00] hover:underline"
                    onClick={() => setForgotOpen(true)}
                  >
                    Forgot your password?
                  </button>
                </p>
              </div>
            </form>

            <OAuthDivider />
            <OAuthProviderRow
              disabled={busy}
              onGoogle={() => void oauthSignIn("google")}
              onFacebook={() => void oauthSignIn("facebook")}
              onApple={() => void oauthSignIn("apple")}
            />

            <div className="mt-3 border-t border-border/60 pt-4 text-center text-sm text-[#003049]">
              <p>
                Need an account?{" "}
                <button
                  type="button"
                  className="font-semibold text-[#F77F00] underline underline-offset-2 hover:text-[#F77F00]/90"
                  onClick={() => {
                    onOpenChange(false);
                    resetFields();
                    onRequestSignUp?.();
                  }}
                >
                  Sign up
                </button>{" "}
                now to get started.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
