"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { DevEmailConfirmationButton } from "@/components/auth/DevEmailConfirmationButton";
import { OAuthDivider, OAuthProviderRow } from "@/components/auth/oauth-social";
import { SignupIssueFeedbackDialog } from "@/components/auth/SignupIssueFeedbackDialog";
import { AlertTriangle, Eye, EyeOff, Lock, Mail, User, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authCallbackWithSignupWizard } from "@/lib/auth/post-signup-redirect";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestSignIn?: () => void;
};

/** Shape captured from a failing `supabase.auth.signUp()` call so we can show
 * the visitor a friendly message and hand details to the admin feedback form. */
type SignupErrorInfo = {
  /** Friendly, visitor-facing copy shown inside the dialog. */
  friendly: string;
  /** Raw Supabase message (kept visible as small secondary text for debuggability). */
  raw: string;
  status?: number;
  code?: string;
};

/** Map a Supabase AuthError into a visitor-facing message. We intentionally avoid
 * displaying Supabase's raw strings as primary copy because they're written for
 * developers ("over_email_send_rate_limit"), not end users. */
function toSignupErrorInfo(err: {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
}): SignupErrorInfo {
  const raw = err.message ?? "Unknown error";
  const status = err.status;
  const code = err.code;
  const haystack = `${raw} ${code ?? ""}`.toLowerCase();

  // Supabase rate-limit family (429 or explicit "for security purposes…" copy).
  if (
    status === 429 ||
    haystack.includes("rate limit") ||
    haystack.includes("for security purposes") ||
    haystack.includes("over_email_send_rate_limit") ||
    haystack.includes("over_request_rate_limit")
  ) {
    return {
      friendly:
        "We're experiencing higher than normal traffic. Please try again in a few minutes, or alert the admin if you continue to experience problems.",
      raw,
      status,
      code,
    };
  }

  if (
    haystack.includes("user already registered") ||
    haystack.includes("already registered") ||
    haystack.includes("user_already_exists")
  ) {
    return {
      friendly:
        "An account with that email already exists. Try signing in instead, or alert the admin if you think this is a mistake.",
      raw,
      status,
      code,
    };
  }

  if (haystack.includes("signup") && haystack.includes("disabled")) {
    return {
      friendly:
        "Signups are temporarily disabled. Please try again later, or alert the admin if you need access.",
      raw,
      status,
      code,
    };
  }

  if (haystack.includes("password") && (haystack.includes("weak") || haystack.includes("least"))) {
    return {
      friendly: raw,
      raw,
      status,
      code,
    };
  }

  if (haystack.includes("invalid") && haystack.includes("email")) {
    return {
      friendly: "That email address doesn't look valid. Please check it and try again.",
      raw,
      status,
      code,
    };
  }

  return {
    friendly:
      "Something went wrong creating your account. Please try again, or alert the admin if you continue to experience problems.",
    raw,
    status,
    code,
  };
}

export function SignUpDialog({ open, onOpenChange, onRequestSignIn }: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** Populated when `supabase.auth.signUp()` returns a non-null error. Drives the
   * friendly error panel (replaces the form) with an "alert the admin" link. */
  const [signupError, setSignupError] = useState<SignupErrorInfo | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  /** True after signUp API succeeds — success dialogue. */
  const [postSignupSuccess, setPostSignupSuccess] = useState(false);
  function reset() {
    setMessage(null);
    setPostSignupSuccess(false);
    setSignupError(null);
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSignupError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setMessage("Please enter your first and last name.");
      return;
    }
    if (!email.includes("@")) {
      setMessage("Please enter a valid email address.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setBusy(true);
    const origin = window.location.origin;
    console.debug("[SignUpDialog] calling supabase.auth.signUp", { email: email.trim() });
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: authCallbackWithSignupWizard(origin),
        data: { first_name: firstName.trim(), last_name: lastName.trim() },
      },
    });
    console.debug("[SignUpDialog] signUp returned", {
      hasError: !!error,
      errorMessage: error?.message,
      hasSession: !!data?.session,
      hasUser: !!data?.user,
      identities: data?.user?.identities?.length ?? null,
    });
    if (error) {
      setBusy(false);
      setSignupError(
        toSignupErrorInfo({
          message: error.message,
          status: (error as { status?: number }).status,
          code: (error as { code?: string }).code,
          name: error.name,
        }),
      );
      return;
    }
    if (data.session) {
      // Session returned (email confirmation off). Save name now so the wizard
      // step pre-fills correctly when the user proceeds.
      await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        }),
      }).catch(() => null);
      // Dev safety net: the visible dialog tells the user "check your email" but a
      // truthy `data.session` means Supabase signed them in instantly without sending
      // any verification email. That only happens when "Confirm email" is OFF in
      // Authentication → Sign In / Up → Email. Surface this loudly in dev so it
      // can't masquerade as a working confirmation flow.
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[SignUpDialog] Supabase returned an active session immediately after signUp(). " +
            "This means 'Confirm email' is currently OFF in your Supabase project — no verification " +
            "email was sent and the user is already signed in. Toggle it ON at " +
            "Supabase Dashboard → Authentication → Sign In / Up → Email → Confirm email.",
        );
      }
    }
    // Always show the post-signup success dialog so the verification notice
    // and DEV bypass button remain visible regardless of whether Supabase
    // email confirmation is on or off.
    setBusy(false);
    setPostSignupSuccess(true);
    console.debug("[SignUpDialog] postSignupSuccess set to true");
  }

  async function oauthSignUp(provider: "google" | "facebook" | "apple") {
    setBusy(true);
    setMessage(null);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    setBusy(false);
    if (error) setMessage(error.message);
  }

  const inputIconClass = "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#F77F00]";
  const inputPadLeft = "pl-10";
  const inputClass = cn(
    inputPadLeft,
    "h-11 rounded-lg border-[#003049]/25 bg-background focus-visible:border-[#F77F00] focus-visible:ring-[#F77F00]/30",
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        console.debug("[SignUpDialog] onOpenChange", {
          next,
          busy,
          postSignupSuccess,
        });
        // Only guard against close while we're mid-request. Once we're showing the
        // success or error panel the user must be able to dismiss the dialog —
        // previously this guard also blocked the explicit ✕ button, leaving users
        // unable to close the "account created" view (especially now that the DEV
        // bypass button is hidden by default and there's nothing else to click).
        if (!next && busy) {
          return;
        }
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent
        className="max-h-[90vh] gap-0 overflow-y-auto border border-border/80 p-0 sm:max-w-[420px] sm:rounded-xl"
        onPointerDownOutside={(e) => {
          // Stray outside clicks still shouldn't dismiss while submitting, while
          // the success notice is mounted (so users actually read "check your
          // email"), or while the error panel is up. The ✕ button + the explicit
          // close action on the success panel are still allowed via onOpenChange.
          if (busy || postSignupSuccess || signupError) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (busy || postSignupSuccess || signupError) e.preventDefault();
        }}
      >
        <DialogHeader className="px-6 pb-2 pt-6">
          {postSignupSuccess ? (
            <>
              <DialogTitle className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-[#F77F00]">
                <span className="text-4xl leading-none" aria-hidden="true">
                  🎉
                </span>
                Account created
              </DialogTitle>
              <DialogDescription className="sr-only">
                Thank you for joining convene. We sent a confirmation link to your email to activate your account and
                start booking experts.
              </DialogDescription>
            </>
          ) : signupError ? (
            <>
              <DialogTitle className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-[#003049]">
                <AlertTriangle className="h-6 w-6 shrink-0 text-[#F77F00]" />
                We couldn&apos;t create your account
              </DialogTitle>
              <DialogDescription className="sr-only">
                Something went wrong while creating your account. You can try again or send a message to the admin.
              </DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-[#003049]">
                <UserPlus className="h-6 w-6 shrink-0 text-[#F77F00]" />
                Create Your Account
              </DialogTitle>
              <DialogDescription className="sr-only">
                Create a new account with your name, email, and password.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        {postSignupSuccess ? (
          <div className="space-y-5 px-6 pb-8 pt-2 text-left">
            <div className="space-y-4 text-sm leading-relaxed text-[#003049]/90">
              <p>Thank you for joining convene! We&apos;re thrilled to have you in our community.</p>
              <p>
                We sent a confirmation link to{" "}
                <span className="break-all font-medium text-[#003049]">{email.trim()}</span>. Follow the link in the email
                to activate your account and start booking experts.
              </p>
            </div>
            <DevEmailConfirmationButton email={email} password={password} />
            <Button
              type="button"
              className="h-11 w-full rounded-lg bg-convene-primary text-base font-semibold text-white hover:bg-convene-primary/90"
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
            >
              Got it
            </Button>
          </div>
        ) : signupError ? (
          <div className="space-y-5 px-6 pb-8 pt-2 text-left">
            <div className="space-y-4 text-sm leading-relaxed text-[#003049]/90">
              <p>{signupError.friendly}</p>
              <p className="text-xs text-[#003049]/60">
                Technical details:{" "}
                <span className="font-mono">
                  {signupError.status ? `${signupError.status} ` : ""}
                  {signupError.code ?? signupError.raw}
                </span>
              </p>
              <p>
                <button
                  type="button"
                  onClick={() => setFeedbackOpen(true)}
                  className="font-semibold text-[#F77F00] underline underline-offset-2 hover:text-[#F77F00]/90"
                >
                  Alert the admin
                </button>{" "}
                if you continue to experience problems.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={() => setSignupError(null)}
                className="h-11 w-full rounded-lg bg-convene-primary text-base font-semibold text-white hover:bg-convene-primary/90"
              >
                Try again
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  reset();
                  onRequestSignIn?.();
                }}
                className="h-11 w-full rounded-lg border-[#003049]/25 text-base font-semibold"
              >
                Sign in instead
              </Button>
            </div>
          </div>
        ) : (
        <div className="px-6 pb-6 pt-2">
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="su-first" className="sr-only">
                First Name
              </Label>
              <div className="relative">
                <User className={inputIconClass} />
                <Input
                  id="su-first"
                  placeholder="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-last" className="sr-only">
                Last Name
              </Label>
              <div className="relative">
                <User className={inputIconClass} />
                <Input
                  id="su-last"
                  placeholder="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-email" className="sr-only">
                Email Address
              </Label>
              <div className="relative">
                <Mail className={inputIconClass} />
                <Input
                  id="su-email"
                  type="email"
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="su-password" className="sr-only">
                Create a Password
              </Label>
              <div className="relative">
                <Lock className={inputIconClass} />
                <Input
                  id="su-password"
                  type={showPassword ? "text" : "password"}
                  placeholder={`Create a Password (${MIN_PASSWORD_LENGTH} characters minimum)`}
                  value={password}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPassword(v);
                    if (v.length < MIN_PASSWORD_LENGTH) setConfirmPassword("");
                  }}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  className={cn(inputClass, "pr-10")}
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
            {password.length >= MIN_PASSWORD_LENGTH ? (
              <div className="space-y-2">
                <Label htmlFor="su-confirm" className="sr-only">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Lock className={inputIconClass} />
                  <Input
                    id="su-confirm"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className={cn(inputClass, "pr-10")}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ) : null}
            {message ? (
              <p
                className={
                  message.startsWith("Check") ? "text-sm text-emerald-600" : "text-sm text-destructive"
                }
              >
                {message}
              </p>
            ) : null}
            <Button
              type="submit"
              className="h-11 w-full rounded-lg bg-convene-primary text-base font-semibold text-white hover:bg-convene-primary/90"
              disabled={busy}
            >
              {busy ? "Creating account…" : "Sign Up"}
            </Button>
          </form>

          <OAuthDivider />
          <OAuthProviderRow
            disabled={busy}
            onGoogle={() => void oauthSignUp("google")}
            onFacebook={() => void oauthSignUp("facebook")}
            onApple={() => void oauthSignUp("apple")}
          />

          <p className="mt-3 text-center text-sm text-[#003049]">
            Already have an account?{" "}
            <button
              type="button"
              className="font-semibold text-[#F77F00] underline underline-offset-2 hover:text-[#F77F00]/90"
              onClick={() => {
                onOpenChange(false);
                reset();
                onRequestSignIn?.();
              }}
            >
              Sign in
            </button>
          </p>

          <p className="mt-4 whitespace-nowrap text-center text-[10px] leading-snug tracking-tight text-[#003049]">
            By signing up, you agree to our{" "}
            <Link href="/terms" className="font-medium text-[#F77F00] underline underline-offset-2 hover:text-[#F77F00]/90">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-[#F77F00] underline underline-offset-2 hover:text-[#F77F00]/90">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        )}
      </DialogContent>
      <SignupIssueFeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        initialEmail={email}
        errorContext={
          signupError
            ? {
                status: signupError.status,
                code: signupError.code,
                message: signupError.raw,
              }
            : undefined
        }
      />
    </Dialog>
  );
}
