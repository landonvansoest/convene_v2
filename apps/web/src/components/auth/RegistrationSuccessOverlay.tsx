"use client";

import { useEffect, useRef } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PARTY_POPPER_RASTER_MASK_STYLE } from "@/lib/convenePartyPopperRaster";

type RegistrationSuccessOverlayProps = {
  open: boolean;
  /** Called when the user dismisses the overlay (X, Skip, or primary CTA after navigation intent). */
  onDismiss: () => void;
  /**
   * Skip / close without taking the tour: mark the dashboard tour as “done” so auto-start does not run.
   * Invoked before `onDismiss` when the user taps Skip.
   */
  onSkipWithoutTour?: () => void;
  /** Starts the dashboard tour; invoked before `onDismiss` when user taps “Take a Quick Tour”. */
  onTakeTour?: () => void;
  className?: string;
  variant?: "learner" | "expert";
};

/**
 * Post-registration congratulations + confetti. Rendered on `/dashboard?registrationComplete=1`
 * so closing the overlay leaves the user on the dashboard, not the signup page.
 */
const EXPERT_SUCCESS_BODY =
  "Congratulations! Your expert registration has been submitted and is under review. You will receive an email as soon as your profile is active and you're ready to start making bookings. In the meantime, get to know your new Expert dashboard.";

export function RegistrationSuccessOverlay({
  open,
  onDismiss,
  onTakeTour,
  onSkipWithoutTour,
  className,
  variant = "learner",
}: RegistrationSuccessOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      firedRef.current = false;
      return;
    }

    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      firedRef.current = true;
      return;
    }

    let cancelled = false;
    const timeoutIds: number[] = [];

    const run = () => {
      const canvas = canvasRef.current;
      if (cancelled) return;
      if (!canvas) {
        return;
      }
      if (firedRef.current) return;
      firedRef.current = true;
      void import("canvas-confetti").then(({ default: confettiLib }) => {
        if (cancelled) return;
        const confetti = confettiLib.create(canvas, { resize: true, useWorker: true });
        const colors = ["#F77F00", "#003049", "#FCBF49", "#ffffff", "#4c8077"];
        const edgeBursts: Array<{ delayMs: number; particleCount: number; opts: Record<string, unknown> }> = [
          { delayMs: 0, particleCount: 48, opts: { spread: 62, startVelocity: 48, origin: { x: 0.08, y: 0.18 } } },
          { delayMs: 70, particleCount: 48, opts: { spread: 62, startVelocity: 48, origin: { x: 0.92, y: 0.2 } } },
          { delayMs: 140, particleCount: 44, opts: { spread: 58, startVelocity: 42, origin: { x: 0.1, y: 0.82 } } },
          { delayMs: 210, particleCount: 44, opts: { spread: 58, startVelocity: 42, origin: { x: 0.9, y: 0.8 } } },
          { delayMs: 100, particleCount: 40, opts: { spread: 75, startVelocity: 38, origin: { x: 0.22, y: 0.06 } } },
          { delayMs: 170, particleCount: 40, opts: { spread: 75, startVelocity: 38, origin: { x: 0.78, y: 0.08 } } },
          { delayMs: 250, particleCount: 38, opts: { spread: 72, startVelocity: 35, origin: { x: 0.06, y: 0.48 } } },
          { delayMs: 280, particleCount: 38, opts: { spread: 72, startVelocity: 35, origin: { x: 0.94, y: 0.52 } } },
          { delayMs: 320, particleCount: 36, opts: { spread: 100, decay: 0.91, scalar: 0.82, origin: { x: 0.14, y: 0.12 } } },
          { delayMs: 360, particleCount: 36, opts: { spread: 100, decay: 0.91, scalar: 0.82, origin: { x: 0.86, y: 0.14 } } },
          { delayMs: 400, particleCount: 32, opts: { spread: 105, decay: 0.92, scalar: 1.1, origin: { x: 0.12, y: 0.88 } } },
          { delayMs: 440, particleCount: 32, opts: { spread: 105, decay: 0.92, scalar: 1.1, origin: { x: 0.88, y: 0.86 } } },
        ];

        for (const { delayMs, particleCount, opts } of edgeBursts) {
          const id = window.setTimeout(() => {
            if (cancelled) return;
            void confetti({
              colors,
              particleCount,
              ...opts,
            });
          }, delayMs);
          timeoutIds.push(id);
        }
      });
    };

    let attempts = 0;
    const tryRun = () => {
      if (cancelled) return;
      if (canvasRef.current) {
        run();
        return;
      }
      attempts += 1;
      if (attempts < 60) {
        window.requestAnimationFrame(tryRun);
      }
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(tryRun));

    return () => {
      cancelled = true;
      for (const id of timeoutIds) window.clearTimeout(id);
      timeoutIds.length = 0;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/85 backdrop-blur-[2px] p-4 sm:p-6",
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="registration-success-title"
    >
      <div className="pointer-events-none absolute inset-0 z-0">
        <canvas ref={canvasRef} className="h-full w-full" aria-hidden />
      </div>
      <div
        className={cn(
          "relative z-20 mx-auto w-full max-h-[min(90vh,820px)] max-w-[min(92vw,620px)] overflow-y-auto rounded-2xl bg-white pb-6 shadow-xl sm:pb-8",
        )}
      >
        <button
          type="button"
          aria-label="Close"
          className="absolute right-3 top-3 z-20 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#F77F00] bg-white text-[#003049] shadow-sm sm:right-4 sm:top-4 sm:h-10 sm:w-10"
          onClick={() => {
            onSkipWithoutTour?.();
            onDismiss();
          }}
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} />
        </button>
        <div className="relative z-[2] px-5 pb-8 pt-12 text-center sm:px-8 sm:pt-14 sm:pr-12">
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center gap-3 sm:gap-4">
              {variant === "expert" ? (
                <div
                  className="h-11 w-11 shrink-0 bg-[#003049] sm:h-12 sm:w-12"
                  style={PARTY_POPPER_RASTER_MASK_STYLE}
                  aria-hidden
                />
              ) : (
                <Sparkles
                  className="h-12 w-12 shrink-0 text-[#003049] sm:h-14 sm:w-14"
                  strokeWidth={1.35}
                  aria-hidden
                />
              )}
              <h2 id="registration-success-title" className="text-left text-2xl font-extrabold text-[#F77F00] sm:text-[28px]">
                Congratulations!
              </h2>
            </div>
          </div>
          <p
            className={cn(
              "mx-auto mt-3 max-w-lg font-medium text-[#003049]",
              variant === "expert"
                ? "text-sm leading-relaxed sm:mt-4 sm:text-[15px]"
                : "text-base leading-snug sm:mt-4 sm:text-lg",
            )}
          >
            {variant === "expert" ? (
              EXPERT_SUCCESS_BODY
            ) : (
              <>
                You&apos;re all set to start booking experts. You&apos;ll find information on your bookings, messages, and
                requests on your dashboard page.
              </>
            )}
          </p>
          <div className="mx-auto mt-7 flex max-w-sm flex-col items-center gap-3 sm:mt-8">
            <Button
              className="h-10 w-full rounded-lg bg-[#F77F00] text-sm font-bold text-white"
              onClick={() => {
                onTakeTour?.();
                onDismiss();
              }}
            >
              Take a Quick Tour
            </Button>
            <button
              type="button"
              className="text-sm font-medium text-[#003049] underline"
              onClick={() => {
                onSkipWithoutTour?.();
                onDismiss();
              }}
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
