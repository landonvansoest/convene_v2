"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { EXPERT_BIBLE_TOUR_STEPS } from "@/components/tour/expert-bible-tour";
import { useExpertDashboardTour } from "@/components/tour/expert-dashboard-tour-context";

const PADDING = 8;
const POPUP_OFFSET = 16;
const POPUP_WIDTH = 320;

function useTourHighlightRect(active: boolean, targetKey: string | null | undefined) {
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
    /** `behavior: smooth` leaves the spotlight rect wrong for several frames vs the dim strips. */
    el.scrollIntoView({ block: "nearest", behavior: "auto" });
    setRect(el.getBoundingClientRect());
    return true;
  }, [active, targetKey]);

  useLayoutEffect(() => {
    if (!active || !targetKey) {
      setRect(null);
      return;
    }
    let cancelled = false;
    if (measure()) {
      return () => {
        cancelled = true;
      };
    }

    const t = window.setInterval(() => {
      if (cancelled) return;
      if (measure()) window.clearInterval(t);
    }, 120);

    const tMax = window.setTimeout(() => window.clearInterval(t), 5000);
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

export function ExpertDashboardTourOverlay() {
  const pathname = usePathname();
  const { active, stepIndex, dismissTour, nextStep } = useExpertDashboardTour();
  const step = EXPERT_BIBLE_TOUR_STEPS[stepIndex];
  const centerOnly = Boolean(step?.centerOnly);
  const targetKey = active && step && !centerOnly ? step.target : null;

  const highlightRect = useTourHighlightRect(active, targetKey);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number }>({ top: 80, left: 16 });

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  /** Position popup beside highlight (fixed coords). */
  useLayoutEffect(() => {
    if (!active || centerOnly || !highlightRect) {
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const approxH = 220;
    const w = Math.min(POPUP_WIDTH, vw - 32);
    let left = highlightRect.right + POPUP_OFFSET;
    let top = highlightRect.top;
    if (left + w > vw - 16) {
      left = highlightRect.left - w - POPUP_OFFSET;
    }
    if (left < 16) left = 16;
    if (top + approxH > vh - 16) {
      top = Math.max(16, vh - approxH - 16);
    }
    if (top < 16) top = 16;
    setPopupPos({ top, left });
  }, [active, centerOnly, highlightRect, stepIndex]);

  if (!mounted || !active || !step || !pathname.startsWith("/dashboard")) return null;

  const isLast = stepIndex >= EXPERT_BIBLE_TOUR_STEPS.length - 1;

  /** Padding around target for ring + shaded cutout (same geometry as learner tour). */
  const ringPad = PADDING;
  const t = highlightRect ? highlightRect.top - ringPad : 0;
  const l = highlightRect ? highlightRect.left - ringPad : 0;
  const w = highlightRect ? highlightRect.width + ringPad * 2 : 0;
  const h = highlightRect ? highlightRect.height + ringPad * 2 : 0;

  const onPrimary = () => {
    if (isLast) dismissTour();
    else nextStep();
  };

  return createPortal(
    <div className="fixed inset-0 z-[305]" aria-live="polite">
      {centerOnly ? (
        <div className="absolute inset-0 bg-black/50" aria-hidden />
      ) : highlightRect ? (
        <>
          <div
            className="absolute bg-black/50"
            style={{ top: 0, left: 0, right: 0, height: Math.max(0, t) }}
            aria-hidden
          />
          <div className="absolute bg-black/50" style={{ top: t + h, left: 0, right: 0, bottom: 0 }} aria-hidden />
          <div className="absolute bg-black/50" style={{ top: t, left: 0, width: Math.max(0, l), height: h }} aria-hidden />
          <div
            className="absolute bg-black/50"
            style={{
              top: t,
              left: l + w,
              right: 0,
              height: h,
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none fixed z-[306] rounded-lg ring-4 ring-[#F77F00] ring-offset-2 ring-offset-transparent"
            style={{ top: t, left: l, width: w, height: h }}
            aria-hidden
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/50" aria-hidden />
      )}

      <div
        className="fixed z-[307] w-[min(calc(100vw-2rem),320px)] rounded-xl border-2 border-[#F77F00] bg-white p-4 shadow-xl"
        style={
          centerOnly
            ? {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }
            : { top: popupPos.top, left: popupPos.left }
        }
      >
        <h2 className="text-lg font-bold text-[#003049]">{step.title}</h2>
        <p className="mt-2 text-sm font-medium leading-snug text-[#003049]/85">{step.body}</p>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            className="bg-[#F77F00] font-semibold text-white hover:bg-[#F77F00]/90"
            onClick={onPrimary}
          >
            {isLast ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
