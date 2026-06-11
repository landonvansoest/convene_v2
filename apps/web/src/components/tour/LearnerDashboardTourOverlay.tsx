"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  LEARNER_TOUR_STEPS,
  LEARNER_TOUR_TARGETS,
  useLearnerDashboardTour,
} from "@/components/tour/learner-dashboard-tour-context";

const PADDING = 8;
const POPUP_OFFSET = 20;

function useTourHighlightRect(active: boolean, targetKey: string | undefined) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    if (!active || !targetKey) {
      setRect(null);
      return false;
    }
    const nodes = document.querySelectorAll(`[data-tour-target="${targetKey}"]`);
    let el: HTMLElement | null = null;
    for (const n of nodes) {
      if (n instanceof HTMLElement) {
        const r = n.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          el = n;
          break;
        }
      }
    }
    if (!el) {
      setRect(null);
      return false;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setRect(el.getBoundingClientRect());
    return true;
  }, [active, targetKey]);

  useLayoutEffect(() => {
    if (!active || !targetKey) {
      setRect(null);
      return;
    }
    let cancelled = false;
    if (measure()) return () => { cancelled = true; };

    const t = window.setInterval(() => {
      if (cancelled) return;
      if (measure()) window.clearInterval(t);
    }, 120);

    const tMax = window.setTimeout(() => window.clearInterval(t), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      window.clearTimeout(tMax);
    };
  }, [active, targetKey, measure]);

  useEffect(() => {
    if (!active) return;
    const onScrollOrResize = () => measure();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [active, measure]);

  return rect;
}

export function LearnerDashboardTourOverlay() {
  const pathname = usePathname();
  const { active, stepIndex, dismissTour, nextStep } = useLearnerDashboardTour();
  const targetKey = active ? LEARNER_TOUR_TARGETS[stepIndex] : undefined;
  const rect = useTourHighlightRect(active, targetKey);
  const copy = LEARNER_TOUR_STEPS[stepIndex];
  const isLast = stepIndex >= LEARNER_TOUR_STEPS.length - 1;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !active || !copy || !pathname.startsWith("/dashboard")) return null;

  const pad = PADDING;
  const t = rect ? rect.top - pad : 0;
  const l = rect ? rect.left - pad : 0;
  const w = rect ? rect.width + pad * 2 : 0;
  const h = rect ? rect.height + pad * 2 : 0;
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;

  const popupApproxHeight = 200;
  const popupTop = rect
    ? rect.bottom + popupApproxHeight + 24 < vh
      ? rect.bottom + POPUP_OFFSET
      : Math.max(16, rect.top - popupApproxHeight - POPUP_OFFSET)
    : 80;
  /** When the highlight target is not in the DOM yet (e.g. sessions list still fetching), `rect` is null — keep the copy centered so it is not stuck at the left margin. */
  const popupLeft = rect ? Math.min(Math.max(16, rect.left), vw - 336) : null;

  return createPortal(
    <div className="fixed inset-0 z-[300]" aria-live="polite">
      {rect ? (
        <>
          <div
            className="absolute bg-black/50"
            style={{ top: 0, left: 0, right: 0, height: Math.max(0, t) }}
            aria-hidden
          />
          <div
            className="absolute bg-black/50"
            style={{ top: t + h, left: 0, right: 0, bottom: 0 }}
            aria-hidden
          />
          <div className="absolute bg-black/50" style={{ top: t, left: 0, width: Math.max(0, l), height: h }} aria-hidden />
          <div
            className="absolute bg-black/50"
            style={{ top: t, left: l + w, right: 0, height: h }}
            aria-hidden
          />
          <div
            className="pointer-events-none fixed z-[301] rounded-lg ring-4 ring-[#F77F00] ring-offset-2 ring-offset-transparent"
            style={{
              top: t,
              left: l,
              width: w,
              height: h,
            }}
            aria-hidden
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/50" aria-hidden />
      )}

      <div
        className="fixed z-[302] w-[min(calc(100vw-2rem),320px)] rounded-xl border-2 border-[#F77F00] bg-white p-4 shadow-xl"
        style={
          popupLeft == null
            ? {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }
            : { top: popupTop, left: popupLeft }
        }
      >
        <h2 className="text-lg font-bold text-[#003049]">{copy.title}</h2>
        <p className="mt-2 text-sm font-medium leading-snug text-[#003049]/85">{copy.body}</p>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            className="bg-[#F77F00] font-semibold text-white hover:bg-[#F77F00]/90"
            onClick={() => {
              if (isLast) dismissTour();
              else nextStep();
            }}
          >
            {isLast ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
