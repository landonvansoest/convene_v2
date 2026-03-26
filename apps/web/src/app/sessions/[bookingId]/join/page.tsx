"use client";

import Daily from "@daily-co/daily-js";
import type { DailyCall } from "@daily-co/daily-js";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function SessionJoinPage() {
  const params = useParams();
  const bookingId = typeof params.bookingId === "string" ? params.bookingId : "";

  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    return () => {
      callRef.current?.destroy();
      callRef.current = null;
    };
  }, []);

  async function startCall() {
    if (!bookingId || !containerRef.current) return;
    setErr(null);
    setBusy(true);
    const res = await fetch(`/api/sessions/${encodeURIComponent(bookingId)}/room`, {
      method: "POST",
    });
    const data = (await res.json()) as { roomUrl?: string; error?: string };
    if (!res.ok) {
      setErr(data.error ?? "Could not start room");
      setBusy(false);
      return;
    }
    const url = data.roomUrl;
    if (!url) {
      setErr("No room URL returned");
      setBusy(false);
      return;
    }

    callRef.current?.destroy();
    callRef.current = null;

    const frame = Daily.createFrame(containerRef.current, {
      showLeaveButton: true,
      iframeStyle: {
        width: "100%",
        height: "min(70vh, 640px)",
        border: "0",
        borderRadius: "8px",
      },
    });
    callRef.current = frame;

    try {
      await frame.join({ url });
      setJoined(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Join failed";
      setErr(msg);
      frame.destroy();
      callRef.current = null;
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-[#003049] py-4 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4">
          <div>
            <h1 className="text-lg font-semibold">Live session</h1>
            <p className="text-xs text-white/70">v1-style session room · Daily.co</p>
          </div>
          <Link
            href="/sessions"
            className="text-sm text-[#F77F00] underline underline-offset-2 hover:text-white"
          >
            ← Dashboard sessions
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-xl border-2 border-[#003049]/10 bg-white p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Join your video call for booking{" "}
            <code className="rounded bg-muted px-1 text-xs">{bookingId || "…"}</code>. Server needs{" "}
            <code className="text-xs">DAILY_API_KEY</code>.
          </p>
          {err ? <p className="mt-4 text-sm text-destructive">{err}</p> : null}
          <button
            type="button"
            disabled={busy || !bookingId}
            onClick={() => void startCall()}
            className="mt-6 rounded-md bg-[#F77F00] px-6 py-2.5 font-medium text-white disabled:opacity-60"
          >
            {busy ? "Connecting…" : joined ? "Reconnect" : "Join video"}
          </button>
          <div ref={containerRef} className="mt-6 w-full" />
        </div>
      </div>
    </div>
  );
}
