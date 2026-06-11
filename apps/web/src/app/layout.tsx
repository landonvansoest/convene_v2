import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import { ConditionalSiteFooter } from "@/components/ConditionalSiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  /** Only `font-mono` regions need this; preloading it caused unused preload warnings on many pages. */
  preload: false,
});

export const metadata: Metadata = {
  title: "Convene",
  description: "Convene v2 — Next.js App Router",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="min-h-dvh" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-dvh flex-col antialiased`}
      >
        <AppProviders>
          {/*
           * Document scroll: footer sits after page content (scroll to see it). No inner overflow-y port — that pinned
           * the footer to the viewport. Full-height routes (e.g. /session) use their own min-h; dashboard uses min-h —
           * see DashboardClient. Session video: `.cursor/rules/session-live-video-layout.mdc`.
           */}
          <div className="flex w-full flex-col">
            <SiteHeader />
            <div className="relative z-0 w-full">{children}</div>
            <ConditionalSiteFooter />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
