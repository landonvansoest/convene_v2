"use client";

import Link from "next/link";
import { RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dashboardTabPillClass,
  dashboardViewCardClass,
  dashboardViewContentBoxClass,
  DashboardViewHeader,
} from "@/app/dashboard/DashboardViewShell";
import { RequestCard, type RequestCardData } from "@/components/requests/RequestCard";
import { dispatchHeaderBadgesMayHaveChanged } from "@/lib/messages/inbox-unread-events";
import { cn } from "@/lib/utils";

type Req = RequestCardData;

type CategoryRow = {
  category_id: string;
  name: string;
  icon: string | null;
  is_active: boolean;
};

export default function DashboardCommunityRequestsView({ categoryId }: { categoryId: string | null }) {
  const [tab, setTab] = useState<"forYou" | "all">("forYou");
  const [requests, setRequests] = useState<Req[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [listCategoryFilter, setListCategoryFilter] = useState("");
  const [busyUpvoteId, setBusyUpvoteId] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "30" });
    if (tab === "forYou" && categoryId) {
      params.set("category_id", categoryId);
      params.set("for_you", "1");
    } else if (tab === "all" && listCategoryFilter.trim()) {
      params.set("category_id", listCategoryFilter.trim());
    }
    const res = await fetch(`/api/requests?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Failed to load");
      setRequests([]);
      return;
    }
    setErr(null);
    setRequests((data.requests as Req[]) ?? []);
  }, [tab, categoryId, listCategoryFilter]);

  const markSeen = useCallback(async (requestId: string) => {
    setRequests((prev) =>
      prev.map((row) => (row.request_id === requestId ? { ...row, is_unseen: false } : row)),
    );
    try {
      await fetch(`/api/requests/${encodeURIComponent(requestId)}/seen`, { method: "POST" });
      dispatchHeaderBadgesMayHaveChanged();
    } catch {
      // Best-effort; UI already optimistic.
    }
  }, []);

  const hideRequest = useCallback(async (requestId: string) => {
    setRequests((prev) => prev.filter((row) => row.request_id !== requestId));
    try {
      await fetch(`/api/requests/${encodeURIComponent(requestId)}/hide`, { method: "POST" });
      dispatchHeaderBadgesMayHaveChanged();
    } catch {
      void load();
    }
  }, [load]);

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

  const categoryNameById = useMemo(() => new Map(categories.map((c) => [c.category_id, c.name])), [categories]);
  const categoryIconById = useMemo(() => new Map(categories.map((c) => [c.category_id, c.icon])), [categories]);

  const showForYouEmpty = tab === "forYou" && !categoryId;

  return (
    <div className={dashboardViewCardClass}>
      <DashboardViewHeader
        Icon={Sparkles}
        title="Community Requests"
        subtitle="See hand selected user requests, respond with information or offers to book a session."
        actions={
          <>
            <button
              type="button"
              aria-label="Refresh requests"
              onClick={() => void load()}
              className="rounded-md p-2 text-[#003049] transition hover:bg-[#003049]/5"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
            </button>
            <Link
              href="/requests"
              className="rounded-lg border border-[#003049]/15 px-3 py-1.5 text-sm font-medium text-[#003049] hover:bg-gray-50"
            >
              Open full board
            </Link>
          </>
        }
      />

      <div className="mt-6 grid w-full max-w-md grid-cols-2 gap-0.5 rounded-lg border border-[#003049]/15 p-0.5">
        <button
          type="button"
          onClick={() => setTab("forYou")}
          className={cn(dashboardTabPillClass(tab === "forYou"), "w-full")}
        >
          For you
        </button>
        <button
          type="button"
          onClick={() => setTab("all")}
          className={cn(dashboardTabPillClass(tab === "all"), "w-full")}
        >
          All requests
        </button>
      </div>

      {tab === "all" ? (
        <label className="mt-4 block max-w-xs">
          <span className="text-xs font-medium text-muted-foreground">Category</span>
          <select
            className="mt-1 w-full rounded-lg border border-[#003049]/15 bg-white px-3 py-2 text-sm outline-none focus:border-[#F77F00]"
            value={listCategoryFilter}
            onChange={(e) => setListCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {categories
              .filter((c) => c.is_active)
              .map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}

      {err ? <p className="mt-4 text-sm text-red-600">{err}</p> : null}

      <div className={dashboardViewContentBoxClass}>
      {showForYouEmpty ? (
        <div className="rounded-lg border border-dashed border-[#003049]/20 bg-gray-50 p-6 text-center text-sm text-muted-foreground">
          <Sparkles className="mx-auto h-10 w-10 text-[#003049]/25" strokeWidth={1.5} aria-hidden />
          <p>We don&apos;t know your expert category yet. Complete your expert profile with a category to see tailored
            requests here, or switch to &quot;All requests&quot;.</p>
          <Link href="/profile" className="mt-3 inline-block font-medium text-[#F77F00] underline">
            Profile settings
          </Link>
        </div>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : requests.length === 0 ? (
        <div className="py-6 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-[#003049]/25" strokeWidth={1.5} aria-hidden />
          <p className="mt-2 text-sm text-muted-foreground">No requests yet, check back soon.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.request_id}>
              <RequestCard
                request={r}
                categoryName={r.category_id ? categoryNameById.get(r.category_id) : null}
                categoryIcon={r.category_id ? categoryIconById.get(r.category_id) : null}
                onToggleUpvote={toggleUpvote}
                busyUpvote={busyUpvoteId === r.request_id}
                expertDashboard
                forYouExpert={tab === "forYou"}
                onMarkSeen={tab === "forYou" ? markSeen : undefined}
                onHide={tab === "forYou" ? hideRequest : undefined}
                onResponseCountChange={(requestId, responseCount) => {
                  setRequests((prev) =>
                    prev.map((row) =>
                      row.request_id === requestId ? { ...row, response_count: responseCount } : row,
                    ),
                  );
                }}
              />
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}
