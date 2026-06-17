"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const isDev = process.env.NODE_ENV === "development";

type Props = {
  email: string;
  password: string;
};

/**
 * Local dev only: server confirms the auth user’s email (service role), then the client
 * signs in and opens the registration wizard — avoids Supabase email links that can fail
 * PKCE exchange in the browser. Rendering is further gated by the admin
 * DEV Tools toggle `email_verification_bypass` so it can be hidden without
 * a redeploy.
 */
export function DevEmailConfirmationButton({ email, password }: Props) {
  const [busy, setBusy] = useState(false);
  const [toolEnabled, setToolEnabled] = useState<boolean | null>(null);
  const supabase = useMemo(() => createBrowserSupabase(), []);

  useEffect(() => {
    if (!isDev) {
      setToolEnabled(false);
      return;
    }
    let cancelled = false;
    void fetch("/api/dev-tools/public", { cache: "no-store" })
      .then(async (r) =>
        r.ok
          ? ((await r.json()) as { enabled?: { email_verification_bypass?: boolean } })
          : null,
      )
      .then((data) => {
        if (cancelled) return;
        // Default to OFF while the toggle preference is unknown — previously this
        // defaulted to ON which made the button briefly render on every signup before
        // the admin setting loaded, even when the admin had disabled it.
        setToolEnabled(Boolean(data?.enabled?.email_verification_bypass ?? false));
      })
      .catch(() => {
        if (!cancelled) setToolEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Render only after the toggle resolves — prevents the brief "flash" where the
  // button appears for ~half a second before the disabled state hydrates.
  if (!isDev || toolEnabled !== true) return null;

  return (
    <div className="space-y-1.5 rounded-lg border border-dashed border-amber-500/60 bg-amber-50/80 px-3 py-3 text-amber-950">
      <p className="text-[11px] leading-snug text-amber-900/90">
        Confirms your email in Supabase and signs you in (uses your password from this signup only;
        requires <code className="rounded bg-amber-100/80 px-0.5">SUPABASE_SERVICE_ROLE_KEY</code>).
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-9 w-full border-amber-600/50 bg-white text-xs font-semibold text-amber-950 hover:bg-amber-50"
        disabled={busy || !password}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/dev/confirm-signup-link", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: email.trim(), password }),
            });
            const j = (await r.json()) as { ok?: boolean; error?: string };
            if (!r.ok || !j.ok) {
              throw new Error(j.error ?? "Could not confirm account for dev sign-in");
            }
            const { error: signErr } = await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (signErr) {
              throw new Error(signErr.message);
            }
            // Let @supabase/ssr persist cookies / storage before hard navigation so
            // `/auth/callback/signup` can resolve the session reliably.
            await supabase.auth.getSession();
            window.location.assign(`${window.location.origin}/auth/callback/signup`);
          } catch (e) {
            console.error(e);
            alert(e instanceof Error ? e.message : "Dev confirmation failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening sign-up wizard…" : "DEV Bypass Email Verification Link"}
      </Button>
    </div>
  );
}
