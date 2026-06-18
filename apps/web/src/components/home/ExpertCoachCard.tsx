import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { OnlineDot } from "@/components/presence/OnlineDot";
import { VerifiedExpertPhotoBadge } from "@/components/expert/VerifiedExpertBadge";
import { VisibleTempDot } from "@/components/presence/VisibleTempDot";

export type ExpertCoachCardProps = {
  id: string;
  name: string;
  title: string;
  image: string | null;
  rating?: number | null;
  availableNow?: boolean;
  isVerified?: boolean;
  online?: boolean;
  expertVisibilityState?: string | null;
};

export function ExpertCoachCard({
  id,
  name,
  title,
  image,
  rating = null,
  availableNow = false,
  isVerified = false,
  online = false,
  expertVisibilityState = null,
}: ExpertCoachCardProps) {
  const initials = name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const ratingNum = typeof rating === "number" && !Number.isNaN(rating) ? rating : 0;

  return (
    <Link
      href={`/expert/${id}`}
      className="group block overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-all duration-300 hover:border-primary/50 hover:shadow-lg"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {image ? (
          <Image
            src={image}
            alt={name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 16vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary/10 text-4xl font-semibold text-primary">
            {initials}
          </div>
        )}
        {isVerified ? <VerifiedExpertPhotoBadge /> : null}
        <OnlineDot online={online} availableNow={availableNow} />
      </div>
      <div className="space-y-1 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-base font-bold transition-colors group-hover:text-primary">{name}</h3>
            <VisibleTempDot expertVisibilityState={expertVisibilityState} variant="inline" />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Star
              className={
                ratingNum > 0 ? "h-3.5 w-3.5 fill-amber-400 text-amber-400" : "h-3.5 w-3.5 text-gray-300"
              }
            />
            {ratingNum > 0 ? <span className="text-sm font-semibold">{ratingNum.toFixed(1)}</span> : null}
          </div>
        </div>
        <p className="truncate text-sm text-muted-foreground">{title}</p>
      </div>
    </Link>
  );
}
