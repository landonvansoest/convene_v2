"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

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
      <TooltipProvider delayDuration={200}>
        {children}
        <Toaster />
        <SonnerToaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
