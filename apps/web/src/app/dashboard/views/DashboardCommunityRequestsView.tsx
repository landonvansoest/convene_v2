"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Req = {
  request_id: string;
  title: string;
  description: string;
  response_count: number;
  created_at: string;
  skills: string[];
  category_id: string | null;
};

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

  const showForYouEmpty = tab === "forYou" && !categoryId;

  return (
    <div className="rounded-xl border-2 border-[#003049]/10 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#003049]">Community requests</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Browse public asks. Respond from a request&apos;s detail page if you&apos;re an active expert.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-[#003049]/15 px-3 py-1.5 text-sm font-medium text-[#003049] hover:bg-gray-50"
          >
            Refresh
          </button>
          <Link
            href="/requests"
            className="rounded-lg border border-[#003049]/15 px-3 py-1.5 text-sm font-medium text-[#003049] hover:bg-gray-50"
          >
            Open full board
          </Link>
        </div>
      </div>

      <div className="mt-6 inline-flex rounded-lg border border-[#003049]/15 p-0.5">
        <button
          type="button"
          onClick={() => setTab("forYou")}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            tab === "forYou" ? "bg-[#003049] text-white" : "text-[#003049] hover:bg-gray-50"
          }`}
        >
          For you
        </button>
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            tab === "all" ? "bg-[#003049] text-white" : "text-[#003049] hover:bg-gray-50"
          }`}
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

      {showForYouEmpty ? (
        <div className="mt-6 rounded-lg border border-dashed border-[#003049]/20 bg-gray-50 p-6 text-sm text-muted-foreground">
          <p>We don&apos;t know your expert category yet. Complete your expert profile with a category to see tailored
            requests here, or switch to &quot;All requests&quot;.</p>
          <Link href="/profile" className="mt-3 inline-block font-medium text-[#F77F00] underline">
            Profile settings
          </Link>
        </div>
      ) : loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No requests in this view.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {requests.map((r) => (
            <li key={r.request_id}>
              <Link
                href={`/requests/${encodeURIComponent(r.request_id)}`}
                className="block rounded-xl border border-[#003049]/10 bg-gray-50/60 p-4 transition hover:border-[#003049]/25 hover:bg-white"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold text-[#003049]">{r.title}</h3>
                  <span className="text-xs text-muted-foreground">
                    {r.response_count} response{r.response_count === 1 ? "" : "s"}
                  </span>
                </div>
                {r.category_id ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {categoryNameById.get(r.category_id) ?? "Category"}
                  </p>
                ) : null}
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
                {r.skills?.length ? (
                  <p className="mt-2 text-xs text-muted-foreground">Skills: {r.skills.join(", ")}</p>
                ) : null}
                <p className="mt-2 text-[10px] text-muted-foreground">{r.created_at}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
