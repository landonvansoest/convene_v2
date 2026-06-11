"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";

/** Omits the global footer on full-height routes (e.g. live video session). */
export function ConditionalSiteFooter() {
  const pathname = usePathname();
  if (pathname?.startsWith("/session/")) return null;
  return <SiteFooter />;
}
