"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export const LEARNER_TOUR_STORAGE_KEY = "convene_learner_dashboard_tour_v1_done";
export function learnerTourStorageKeyForUser(userId?: string | null): string {
  const id = userId?.trim();
  return id ? `${LEARNER_TOUR_STORAGE_KEY}:${id}` : LEARNER_TOUR_STORAGE_KEY;
}

export const LEARNER_TOUR_TARGETS = [
  "sidebar-booked-sessions",
  "tour-join-session",
  "sidebar-inbox",
  "sidebar-requests",
  "header-search",
] as const;

export type LearnerTourTarget = (typeof LEARNER_TOUR_TARGETS)[number];

export const LEARNER_TOUR_STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Booked Sessions",
    body: "You'll find all of your upcoming bookings and previous session information here.",
  },
  {
    title: "Join Session",
    body: "You can join your session by clicking this button within 10 minutes of the start time.",
  },
  {
    title: "Inbox",
    body: "You can message experts at any time, your conversations will always live here.",
  },
  {
    title: "Your Requests",
    body: "Here you can Post a Request to our network and let experts come to you. Use this section to track Expert responses to each of your posts.",
  },
  {
    title: "Search",
    body: "Get started here! Search for an expert or ask a question. Best of luck!",
  },
];

type LearnerDashboardTourContextValue = {
  active: boolean;
  stepIndex: number;
  startTour: (userId?: string | null) => void;
  dismissTour: () => void;
  nextStep: () => void;
};

const LearnerDashboardTourContext = createContext<LearnerDashboardTourContextValue | null>(null);

export function LearnerDashboardTourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [tourUserId, setTourUserId] = useState<string | null>(null);

  const startTour = useCallback((userId?: string | null) => {
    const normalized = userId?.trim() || null;
    setTourUserId(normalized);
    setStepIndex(0);
    setActive(true);
    try {
      localStorage.removeItem(learnerTourStorageKeyForUser(normalized));
    } catch {
      /* ignore */
    }
  }, []);

  const dismissTour = useCallback(() => {
    setActive(false);
    setStepIndex(0);
    try {
      localStorage.setItem(learnerTourStorageKeyForUser(tourUserId), "1");
    } catch {
      /* ignore */
    }
  }, [tourUserId]);

  const nextStep = useCallback(() => {
    setStepIndex((s) => (s >= LEARNER_TOUR_STEPS.length - 1 ? s : s + 1));
  }, []);

  const value = useMemo(
    () => ({
      active,
      stepIndex,
      startTour,
      dismissTour,
      nextStep,
    }),
    [active, stepIndex, startTour, dismissTour, nextStep]
  );

  return (
    <LearnerDashboardTourContext.Provider value={value}>{children}</LearnerDashboardTourContext.Provider>
  );
}

export function useLearnerDashboardTour(): LearnerDashboardTourContextValue {
  const ctx = useContext(LearnerDashboardTourContext);
  if (!ctx) {
    throw new Error("useLearnerDashboardTour must be used within LearnerDashboardTourProvider");
  }
  return ctx;
}
