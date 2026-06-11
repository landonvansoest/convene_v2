"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { EXPERT_BIBLE_TOUR_STEPS } from "@/components/tour/expert-bible-tour";

export const EXPERT_TOUR_STORAGE_KEY = "convene_expert_dashboard_tour_v1_done";

export function expertTourStorageKeyForUser(userId?: string | null): string {
  const id = userId?.trim();
  return id ? `${EXPERT_TOUR_STORAGE_KEY}:${id}` : EXPERT_TOUR_STORAGE_KEY;
}

export const EXPERT_TOUR_STEP_COUNT = EXPERT_BIBLE_TOUR_STEPS.length;

type ExpertDashboardTourContextValue = {
  active: boolean;
  stepIndex: number;
  startTour: (userId?: string | null) => void;
  dismissTour: () => void;
  nextStep: () => void;
};

const ExpertDashboardTourContext = createContext<ExpertDashboardTourContextValue | null>(null);

export function ExpertDashboardTourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [tourUserId, setTourUserId] = useState<string | null>(null);

  const startTour = useCallback((userId?: string | null) => {
    const normalized = userId?.trim() || null;
    setTourUserId(normalized);
    setStepIndex(0);
    setActive(true);
    try {
      localStorage.removeItem(expertTourStorageKeyForUser(normalized));
    } catch {
      /* ignore */
    }
  }, []);

  const dismissTour = useCallback(() => {
    setActive(false);
    setStepIndex(0);
    try {
      localStorage.setItem(expertTourStorageKeyForUser(tourUserId), "1");
    } catch {
      /* ignore */
    }
  }, [tourUserId]);

  const nextStep = useCallback(() => {
    setStepIndex((s) => (s >= EXPERT_BIBLE_TOUR_STEPS.length - 1 ? s : s + 1));
  }, []);

  const value = useMemo(
    () => ({
      active,
      stepIndex,
      startTour,
      dismissTour,
      nextStep,
    }),
    [active, stepIndex, startTour, dismissTour, nextStep],
  );

  return <ExpertDashboardTourContext.Provider value={value}>{children}</ExpertDashboardTourContext.Provider>;
}

export function useExpertDashboardTour(): ExpertDashboardTourContextValue {
  const ctx = useContext(ExpertDashboardTourContext);
  if (!ctx) {
    throw new Error("useExpertDashboardTour must be used within ExpertDashboardTourProvider");
  }
  return ctx;
}
