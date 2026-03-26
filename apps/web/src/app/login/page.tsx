"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router, supabase]);

  async function onMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    const redirectTo =
      typeof window === "undefined"
        ? undefined
        : `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("sent");
    setMessage("Magic link sent. Open your email and complete sign-in.");
  }

  async function onPasswordSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[var(--convene-primary)] text-white flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-white/20 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-widest text-[var(--convene-hero)] mb-2">
          Convene v2
        </p>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-white/80">
          The public site is the{" "}
          <Link href="/" className="text-[var(--convene-hero)] underline underline-offset-2">
            home page
          </Link>
          . This page is only for account sign-in. Magic links return via{" "}
          <code className="text-white">/auth/callback</code>.
        </p>

        <form onSubmit={onPasswordSignIn} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-white/90">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-white/25 bg-black/20 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
              placeholder="you@example.com"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-white/90">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-white/25 bg-black/20 px-3 py-2 outline-none focus:border-[var(--convene-hero)]"
              placeholder="Your password"
            />
          </label>

          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-md bg-[var(--convene-hero)] text-[var(--convene-primary)] px-4 py-2.5 font-medium disabled:opacity-60"
          >
            {status === "sending" ? "Signing in..." : "Sign in with password"}
          </button>
        </form>

        <form onSubmit={onMagicLink} className="mt-4">
          <button
            type="submit"
            disabled={status === "sending" || !email}
            className="w-full rounded-md border border-white/30 px-4 py-2.5 font-medium disabled:opacity-60 hover:bg-white/10"
          >
            {status === "sending" ? "Sending..." : "Send magic link instead"}
          </button>
        </form>

        {message ? (
          <p
            className={`mt-4 text-sm ${
              status === "error" ? "text-red-300" : "text-emerald-300"
            }`}
          >
            {message}
          </p>
        ) : null}

        <div className="mt-6 flex items-center gap-4 text-sm">
          <Link href="/" className="text-white/80 hover:text-white">
            Back home
          </Link>
          <Link href="/api/me" className="text-white/80 hover:text-white">
            Test session at /api/me
          </Link>
        </div>
      </div>
    </div>
  );
}
