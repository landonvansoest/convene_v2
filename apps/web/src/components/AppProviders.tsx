"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { LearnerDashboardTourProvider } from "@/components/tour/learner-dashboard-tour-context";
import { LearnerDashboardTourOverlay } from "@/components/tour/LearnerDashboardTourOverlay";
import { ExpertDashboardTourProvider } from "@/components/tour/expert-dashboard-tour-context";
import { ExpertDashboardTourOverlay } from "@/components/tour/ExpertDashboardTourOverlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { OnlinePresenceHeartbeat } from "@/components/presence/OnlinePresenceHeartbeat";

/**
 * ThemeProvider for Sonner / components that read useTheme(). Dark mode is off until re-enabled:
 * remove forcedTheme, set enableSystem + defaultTheme as desired, and restore prefers-color-scheme in globals.css if needed.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      forcedTheme="light"
      disableTransitionOnChange
    >
      <LearnerDashboardTourProvider>
        <ExpertDashboardTourProvider>
          <TooltipProvider delayDuration={200}>
            <OnlinePresenceHeartbeat />
            {children}
            <LearnerDashboardTourOverlay />
            <ExpertDashboardTourOverlay />
            <Toaster />
            <SonnerToaster />
          </TooltipProvider>
        </ExpertDashboardTourProvider>
      </LearnerDashboardTourProvider>
    </ThemeProvider>
  );
}
