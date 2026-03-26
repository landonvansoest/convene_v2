import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 px-4 py-10 text-muted-foreground">
          <p className="mx-auto max-w-xl">Loading…</p>
        </div>
      }
    >
      <DashboardClient />
    </Suspense>
  );
}

