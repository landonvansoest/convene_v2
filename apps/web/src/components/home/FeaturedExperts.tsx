"use client";

import { useEffect, useState } from "react";
import { ExpertCoachCard } from "@/components/home/ExpertCoachCard";

type ApiExpert = {
  id: string;
  name: string;
  profile_photo?: string | null;
  professional_title?: string | null;
  is_verified?: boolean | null;
  rating?: number | null;
};

export function FeaturedExperts() {
  const [experts, setExperts] = useState<ApiExpert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/experts?limit=24");
      const data = await res.json();
      if (cancelled) return;
      if (res.ok) {
        setExperts((data.experts as ApiExpert[]) ?? []);
      } else {
        setExperts([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="bg-background py-16">
      <div className="mx-auto w-full max-w-screen-2xl px-4 md:px-6">
        <h2 className="mb-8 text-center text-3xl font-bold text-foreground">Featured Experts</h2>
        {loading ? (
          <p className="py-12 text-center text-muted-foreground">Loading experts...</p>
        ) : experts.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            No experts yet. Complete expert onboarding and approval to appear here.
          </p>
        ) : (
          <div className="grid animate-fade-in grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {experts.map((coach) => (
              <ExpertCoachCard
                key={coach.id}
                id={coach.id}
                name={coach.name}
                title={coach.professional_title ?? coach.name}
                image={coach.profile_photo ?? null}
                rating={coach.rating}
                availableNow={false}
                isVerified={!!coach.is_verified}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
