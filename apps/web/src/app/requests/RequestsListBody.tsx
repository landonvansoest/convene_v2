"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  dashboardInputClass,
  dashboardViewCardClass,
  dashboardViewContentBoxClass,
  DashboardViewHeader,
} from "@/app/dashboard/DashboardViewShell";
import { DashboardYourRequestsView } from "@/app/dashboard/views/DashboardYourRequestsView";
import { PostRequestDialog } from "@/components/requests/PostRequestDialog";
import { RequestCard, type RequestCardData } from "@/components/requests/RequestCard";
import { cn } from "@/lib/utils";

type Req = RequestCardData;

type CategoryRow = {
  category_id: string;
  name: string;
  icon: string | null;
  is_active: boolean;
};

export function RequestsListBody({ variant = "page" }: { variant?: "page" | "dashboard" }) {
  const [requests, setRequests] = useState<Req[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listCategoryFilter, setListCategoryFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [postOpen, setPostOpen] = useState(false);

  // Optimistic upvote state — we trust the server but render the toggle
  // immediately and reconcile when the POST returns.
  const [busyUpvoteId, setBusyUpvoteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "30" });
    if (listCategoryFilter.trim()) {
      params.set("category_id", listCategoryFilter.trim());
    }
    const res = await fetch(`/api/requests?${params.toString()}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Failed");
      setRequests([]);
      return;
    }
    setErr(null);
    setRequests((data.requests as Req[]) ?? []);
  }, [listCategoryFilter]);

  useEffect(() => {
    let c = false;
    (async () => {
      const catRes = await fetch("/api/categories");
      if (catRes.ok && !c) {
        const catJson = await catRes.json();
        setCategories((catJson.categories as CategoryRow[]) ?? []);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      await load();
      if (!c) setLoading(false);
    })();
    return () => {
      c = true;
    };
  }, [load]);

  const categoryNameById = useMemo(
    () => new Map(categories.map((c) => [c.category_id, c.name])),
    [categories],
  );
  const categoryIconById = useMemo(
    () => new Map(categories.map((c) => [c.category_id, c.icon])),
    [categories],
  );

  // Active categories only, sorted alphabetically; "All requests" pinned on top.
  const visibleCategories = useMemo(
    () =>
      categories
        .filter((c) => c.is_active)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  // Client-side search across title + description + skills (Bible: keep
  // sidebar instant; full-text + server filter happens via the category
  // dropdown). Case-insensitive substring match.
  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => {
      if (r.title?.toLowerCase().includes(q)) return true;
      if (r.description?.toLowerCase().includes(q)) return true;
      if (r.skills?.some((s) => s.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [requests, searchQuery]);

  async function toggleUpvote(reqId: string) {
    if (busyUpvoteId) return;
    setBusyUpvoteId(reqId);
    // Optimistic update first.
    setRequests((prev) =>
      prev.map((r) =>
        r.request_id === reqId
          ? {
              ...r,
              i_upvoted: !r.i_upvoted,
              upvote_count: r.upvote_count + (r.i_upvoted ? -1 : 1),
            }
          : r,
      ),
    );
    try {
      const res = await fetch(`/api/requests/${encodeURIComponent(reqId)}/upvote`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        // Revert if the server rejects us.
        setRequests((prev) =>
          prev.map((r) =>
            r.request_id === reqId
              ? {
                  ...r,
                  i_upvoted: !r.i_upvoted,
                  upvote_count: r.upvote_count + (r.i_upvoted ? -1 : 1),
                }
              : r,
          ),
        );
        window.alert(typeof data.error === "string" ? data.error : "Could not upvote");
        return;
      }
      // Reconcile with server-authoritative counts.
      setRequests((prev) =>
        prev.map((r) =>
          r.request_id === reqId
            ? { ...r, i_upvoted: !!data.upvoted, upvote_count: Number(data.count ?? r.upvote_count) }
            : r,
        ),
      );
    } finally {
      setBusyUpvoteId(null);
    }
  }

  if (variant === "dashboard") {
    return <DashboardYourRequestsView />;
  }

  return (
    <div className="bg-[#F3F4F6]">
      <PostRequestDialog
        open={postOpen}
        onOpenChange={setPostOpen}
        onPosted={() => {
          setPostOpen(false);
          void load();
        }}
      />

      {/* Sidebar + main share the same flush-left layout the dashboard uses:
          the sidebar is a full-height white panel pinned to the left edge of
          the viewport (no centered max-width wrapper) with a right border;
          the main column takes the rest and adds its own padding.
          `min-h-screen` lives on the flex row so the sidebar can `self-stretch`
          all the way to the bottom of the viewport even when the main column
          is shorter than the screen. */}
      <div className="flex min-h-screen min-w-0 flex-row">
        <aside className="w-52 shrink-0 self-stretch border-r border-[#003049]/12 bg-white sm:w-60 lg:w-72">
          <div className="flex flex-col p-4 sm:p-5">
            <Button
              type="button"
              className="w-full justify-start gap-2 bg-[#003049] text-sm font-semibold text-white hover:bg-[#003049]/90"
              onClick={() => setPostOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Post a request
            </Button>

            <div className="mt-4">
              <label htmlFor="requests-search" className="sr-only">
                Search user requests
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#003049]/45" />
                <input
                  id="requests-search"
                  type="search"
                  placeholder="Search User Requests"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(dashboardInputClass, "pl-9")}
                />
              </div>
            </div>

            <nav aria-label="Filter by category" className="mt-5 space-y-0.5">
              <p className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-[#003049]/55">
                Categories
              </p>
              <button
                type="button"
                onClick={() => setListCategoryFilter("")}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[15px] transition",
                  listCategoryFilter === ""
                    ? "bg-[#003049]/10 font-semibold text-[#003049]"
                    : "text-[#003049]/80 hover:bg-[#003049]/5",
                )}
              >
                <span>All requests</span>
              </button>
              {visibleCategories.map((c) => {
                const active = listCategoryFilter === c.category_id;
                return (
                  <button
                    key={c.category_id}
                    type="button"
                    onClick={() => setListCategoryFilter(c.category_id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[15px] transition",
                      active
                        ? "bg-[#003049]/10 font-semibold text-[#003049]"
                        : "text-[#003049]/80 hover:bg-[#003049]/5",
                    )}
                  >
                    {c.icon ? <span aria-hidden>{c.icon}</span> : null}
                    <span className="flex-1 truncate">{c.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main column — uses DashboardViewHeader + view content box so the
            heading, spacing, and card chrome line up with /dashboard. */}
        <main className="min-w-0 flex-1 overflow-x-auto px-3 py-6 sm:px-4 lg:px-6 lg:py-8">
          <div className={dashboardViewCardClass}>
            <DashboardViewHeader
              Icon={Users}
              title="Community Requests"
              subtitle="Explore previous community requests and expert advice."
            />

            <div className={dashboardViewContentBoxClass}>
              {err ? <p className="mb-4 text-sm text-red-600">{err}</p> : null}

              {loading ? (
                <p className="text-sm text-[#003049]/60">Loading…</p>
              ) : filteredRequests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#003049]/20 bg-[#003049]/[0.02] p-8 text-center">
                  <p className="text-sm text-[#003049]/70">
                    {searchQuery
                      ? "No requests match your search."
                      : "No requests in this category yet."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4"
                    onClick={() => setPostOpen(true)}
                  >
                    <Plus className="h-4 w-4" /> Post the first one
                  </Button>
                </div>
              ) : (
                <ul className="space-y-3">
                  {filteredRequests.map((r) => (
                    <li key={r.request_id}>
                      <RequestCard
                        request={r}
                        categoryName={r.category_id ? categoryNameById.get(r.category_id) : null}
                        categoryIcon={r.category_id ? categoryIconById.get(r.category_id) : null}
                        onToggleUpvote={toggleUpvote}
                        busyUpvote={busyUpvoteId === r.request_id}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
