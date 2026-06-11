"use client";

import { useEffect, useRef } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const HEARTBEAT_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const MIN_PING_GAP_MS = 30 * 1000; // throttle floor for visibility-resume bursts

function tabIsActive(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible";
}

async function sendHeartbeat(): Promise<void> {
  try {
    await fetch("/api/me/heartbeat", {
      method: "POST",
      credentials: "include",
      keepalive: true,
    });
  } catch {
    // Silent: a missed ping is harmless; the next interval or the sweep cron
    // will reconcile state.
  }
}

function sendOfflineBeacon(): void {
  if (typeof navigator === "undefined") return;
  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([JSON.stringify({ reason: "pagehide" })], {
        type: "application/json",
      });
      navigator.sendBeacon("/api/me/offline", blob);
      return;
    }
  } catch {
    // fall through
  }
  try {
    void fetch("/api/me/offline", {
      method: "POST",
      credentials: "include",
      keepalive: true,
    });
  } catch {
    // best-effort
  }
}

/**
 * Mounts a sitewide presence heartbeat for the signed-in user. Lives inside
 * AppProviders so it runs on every authenticated page.
 *
 * Bible: users.online = true while last user action or heartbeat is within the
 * last 5 minutes. Cadence is 3 minutes so a single missed ping does not flip a
 * user offline; visibility-aware so a backgrounded tab does not lie about
 * presence. Pairs with the /api/cron/sweep-online-presence sweep that flips
 * stale rows back to false.
 */
export function OnlinePresenceHeartbeat() {
  const lastPingRef = useRef<number>(0);
  const sessionRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    let supabase: ReturnType<typeof createBrowserSupabase>;
    try {
      supabase = createBrowserSupabase();
    } catch {
      return;
    }

    function maybePing(force = false) {
      if (cancelled) return;
      if (!sessionRef.current) return;
      if (!force && !tabIsActive()) return;
      const now = Date.now();
      if (!force && now - lastPingRef.current < MIN_PING_GAP_MS) return;
      lastPingRef.current = now;
      void sendHeartbeat();
    }

    function startTimer() {
      if (timer) return;
      timer = setInterval(() => maybePing(false), HEARTBEAT_INTERVAL_MS);
    }

    function stopTimer() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      sessionRef.current = Boolean(data.session);
      if (sessionRef.current) {
        maybePing(true);
        startTimer();
      }
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      const hasSession = Boolean(session);
      sessionRef.current = hasSession;
      if (event === "SIGNED_OUT" || !hasSession) {
        stopTimer();
        return;
      }
      maybePing(true);
      startTimer();
    });

    function handleVisibility() {
      if (tabIsActive()) {
        maybePing(false);
      }
    }

    function handleFocus() {
      maybePing(false);
    }

    function handlePageHide() {
      if (sessionRef.current) sendOfflineBeacon();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      cancelled = true;
      stopTimer();
      authSub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  return null;
}
