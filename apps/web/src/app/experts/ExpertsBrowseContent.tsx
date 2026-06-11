"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExpertsGrid } from "@/components/home/ExpertsGrid";
import { Input } from "@/components/ui/input";

type Expert = {
  id: string;
  name: string;
  profile_photo?: string | null;
  professional_title?: string | null;
  bio?: string | null;
  rate_per_15_min?: number;
  is_verified?: boolean;
  rating?: number | null;
  available_now?: boolean;
  online?: boolean;
};

export function ExpertsBrowseContent() {
  const searchParams = useSearchParams();
  const [experts, setExperts] = useState<Expert[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = searchParams.get("search") ?? "";
    setSearch(q);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const res = await fetch(`/api/experts${q}`);
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to load");
        setExperts([]);
      } else {
        setExperts((data.experts as Expert[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [search]);

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-screen-2xl md:px-2">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Directory</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Experts</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Active experts only. Select a coach to view their profile, message them, or book from{" "}
          <a href="/sessions" className="font-medium text-primary underline">
            Sessions
          </a>
          .
        </p>
        <label className="mt-6 block max-w-md">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Search</span>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or bio keywords"
            className="rounded-full border-border"
          />
        </label>
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
        {loading ? (
          <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
        ) : experts.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">No experts match.</p>
        ) : (
          <div className="mt-10">
            <ExpertsGrid experts={experts} animate={false} />
          </div>
        )}
      </div>
    </div>
  );
}
