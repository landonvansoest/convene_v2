import { Suspense } from "react";
import { ExpertsBrowseContent } from "./ExpertsBrowseContent";

export default function ExpertsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background px-4 py-10">
          <p className="text-sm text-muted-foreground">Loading experts…</p>
        </div>
      }
    >
      <ExpertsBrowseContent />
    </Suspense>
  );
}
