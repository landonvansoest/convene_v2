import { cn } from "@/lib/utils";

function Shimmer({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted/80", className)} />;
}

/**
 * Matches `DashboardClient` shell: sidebar + main side-by-side at all widths.
 */
export function DashboardSkeleton({ statusMessage }: { statusMessage?: string }) {
  return (
    <div className="flex min-h-[calc(100dvh-5rem)] min-w-0 flex-row bg-[#F3F4F6] text-foreground">
      <aside className="w-52 shrink-0 border-r border-[#003049]/10 bg-white sm:w-60 lg:w-72">
        <div className="flex flex-col gap-4 p-4 lg:p-6">
          <div className="flex items-center gap-3">
            <Shimmer className="h-12 w-12 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Shimmer className="h-4 w-32" />
              <Shimmer className="h-3 w-24" />
            </div>
          </div>
          <Shimmer className="h-9 w-full" />
          <div className="space-y-2 pt-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Shimmer key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-auto px-3 py-6 sm:px-4 lg:px-6 lg:py-8">
        <div className="w-full max-w-none space-y-6">
          {statusMessage ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {statusMessage}
            </p>
          ) : null}
          <div className="space-y-2">
            <Shimmer className="h-8 w-48 max-w-full" />
            <Shimmer className="h-4 w-72 max-w-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-[#003049]/10 bg-white p-5 shadow-sm">
                <Shimmer className="mb-3 h-4 w-24" />
                <Shimmer className="h-9 w-16" />
                <Shimmer className="mt-3 h-3 w-full" />
              </div>
            ))}
          </div>
          <Shimmer className="h-40 w-full rounded-xl" />
        </div>
      </main>
    </div>
  );
}
