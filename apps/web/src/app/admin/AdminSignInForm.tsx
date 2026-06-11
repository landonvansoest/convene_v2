"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, LogIn, Mail, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type Props = {
  adminEmailHint: string | null;
  notAuthorizedEmail?: string | null;
};

export function AdminSignInForm({ adminEmailHint, notAuthorizedEmail }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [email, setEmail] = useState(adminEmailHint ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signOutCurrent() {
    await supabase.auth.signOut();
    router.refresh();
  }

  async function onSubmit(event: FormEvent) {
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
    router.replace("/admin");
    router.refresh();
  }

  const inputIconClass =
    "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#F77F00]";

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 text-foreground">
      <div className="mx-auto max-w-md">
        <Card className="border-2 border-[#003049]/10 shadow-sm">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 text-[#003049]">
              <Shield className="h-7 w-7 text-[#F77F00]" />
              <CardTitle className="text-2xl font-semibold">Admin sign in</CardTitle>
            </div>
            <CardDescription>
              {notAuthorizedEmail ? (
                <>
                  Signed in as{" "}
                  <code className="rounded bg-[#003049]/5 px-1.5 py-0.5 text-xs">
                    {notAuthorizedEmail}
                  </code>
                  , but this account is not an admin. Sign out and sign in with the admin email.
                </>
              ) : (
                <>
                  Use the account configured as{" "}
                  <code className="rounded bg-[#003049]/5 px-1.5 py-0.5 text-xs">
                    ADMIN_EMAIL
                  </code>
                  .
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {notAuthorizedEmail ? (
              <Button
                type="button"
                variant="outline"
                className="w-full border-[#003049]/20 text-[#003049]"
                onClick={() => void signOutCurrent()}
              >
                Sign out {notAuthorizedEmail}
              </Button>
            ) : null}

            <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="admin-signin-email">Email</Label>
                <div className="relative">
                  <Mail className={inputIconClass} />
                  <Input
                    id="admin-signin-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={cn(
                      "pl-10 h-11 rounded-lg border-[#003049]/25 bg-background",
                      "focus-visible:border-[#F77F00] focus-visible:ring-[#F77F00]/30",
                    )}
                    placeholder="admin@example.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-signin-password">Password</Label>
                <div className="relative">
                  <Lock className={inputIconClass} />
                  <Input
                    id="admin-signin-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      "pl-10 pr-10 h-11 rounded-lg border-[#003049]/25 bg-background",
                      "focus-visible:border-[#F77F00] focus-visible:ring-[#F77F00]/30",
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
                <p className="text-sm text-destructive">{message}</p>
              ) : null}

              <Button
                type="submit"
                className="h-11 w-full rounded-lg bg-[#F77F00] text-base font-semibold text-white hover:bg-[#F77F00]/90"
                disabled={busy}
              >
                <LogIn className="mr-2 h-4 w-4" />
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
