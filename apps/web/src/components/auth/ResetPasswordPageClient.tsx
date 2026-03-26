"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Lock } from "lucide-react";

export function ResetPasswordPageClient() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setOk(true);
    setTimeout(() => router.push("/dashboard"), 2000);
  }

  if (ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-16">
        <Card className="w-full max-w-md border-green-200">
          <CardContent className="space-y-4 pt-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-green-600">Password updated</h2>
            <p className="text-sm text-muted-foreground">Redirecting to your dashboard…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="container mx-auto max-w-md px-4">
        <Card className="border-2 border-[#003049]/15">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#003049]/10">
              <Lock className="h-6 w-6 text-[#003049]" />
            </div>
            <CardTitle className="text-center text-2xl text-[#003049]">Reset your password</CardTitle>
            <CardDescription className="text-center">
              Open the link from your email first; then set a new password here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pw">New password</Label>
                <Input
                  id="pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirm password</Label>
                <Input
                  id="pw2"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              {err ? <p className="text-sm text-destructive">{err}</p> : null}
              <Button type="submit" className="w-full bg-[#F77F00] text-white" disabled={busy}>
                {busy ? "Saving…" : "Update password"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <Link href="/login" className="text-[#003049] underline">
                Back to sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
