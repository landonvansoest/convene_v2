"use client";

import { ExpertCoachCard } from "@/components/home/ExpertCoachCard";

export type ExpertsGridExpert = {
  id: string;
  name: string;
  profile_photo?: string | null;
  professional_title?: string | null;
  bio?: string | null;
  is_verified?: boolean | null;
  rating?: number | null;
  online?: boolean | null;
  available_now?: boolean | null;
};

export function ExpertsGrid({
  experts,
  animate = true,
  className = "",
}: {
  experts: ExpertsGridExpert[];
  animate?: boolean;
  className?: string;
}) {
  const grid =
    "grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

  return (
    <div className={`grid ${animate ? "animate-fade-in" : ""} ${grid} ${className}`.trim()}>
      {experts.map((e) => (
        <ExpertCoachCard
          key={e.id}
          id={e.id}
          name={e.name}
          title={e.professional_title ?? e.bio ?? e.name}
          image={e.profile_photo ?? null}
          rating={e.rating}
          availableNow={!!e.available_now}
          isVerified={!!e.is_verified}
          online={!!e.online}
        />
      ))}
    </div>
  );
}

