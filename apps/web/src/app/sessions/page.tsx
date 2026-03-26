import { Suspense } from "react";
import { SessionsPageClient } from "./SessionsPageClient";

export default function SessionsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--convene-primary)] px-4 py-10 text-white">
          <p className="text-sm text-white/70">Loading sessions…</p>
        </div>
      }
    >
      <SessionsPageClient />
    </Suspense>
  );
}
