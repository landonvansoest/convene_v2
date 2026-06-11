"use client";

import { useEffect, useState } from "react";
import { ExpertsGrid } from "@/components/home/ExpertsGrid";

type ApiExpert = {
  id: string;
  name: string;
  profile_photo?: string | null;
  professional_title?: string | null;
  is_verified?: boolean | null;
  rating?: number | null;
  online?: boolean | null;
};

export function FeaturedExperts() {
  const [experts, setExperts] = useState<ApiExpert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/experts?limit=24&compact=1");
        let data: unknown = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        if (cancelled) return;
        const list = (data as { experts?: ApiExpert[] } | null)?.experts;
        if (res.ok && Array.isArray(list)) {
          setExperts(list);
        } else {
          setExperts([]);
        }
      } catch {
        if (!cancelled) setExperts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="bg-background py-16">
      <div className="mx-auto w-full max-w-screen-2xl px-4 md:px-6">
        <h2 className="mb-4 text-left text-3xl font-bold text-foreground">Featured Experts</h2>
        {loading ? (
          <p className="py-12 text-center text-muted-foreground">Loading experts...</p>
        ) : experts.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            No experts yet. Complete expert onboarding and approval to appear here.
          </p>
        ) : (
          <ExpertsGrid experts={experts} />
        )}
      </div>
    </section>
  );
}
