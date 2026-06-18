import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type Position = "top-right" | "bottom-right";

type Props = {
  online: boolean | null | undefined;
  /** Expert calendar: bookable within the next hour. */
  availableNow?: boolean | null | undefined;
  position?: Position;
  className?: string;
};

/**
 * Avatar photos are circles inscribed in a square wrapper. To sit the dot on
 * the outside edge of the circle (1:30 position) rather than overlapping the
 * photo, the dot center must land on the circle's perimeter at 45°:
 *
 *   center = (50% + 50%·cos45°, 50% − 50%·sin45°) ≈ (85.4%, 14.6%)
 *
 * With width 26% (radius 13%), that means right/top offsets ≈ 1.5%.
 */
const POSITION_CLASS: Record<Position, string> = {
  "top-right": "right-[1.5%] top-[1.5%]",
  "bottom-right": "right-[1.5%] bottom-[1.5%]",
};

const SIZE_STYLE = {
  width: "26%",
  height: "26%",
  minWidth: "10px",
  minHeight: "10px",
};

/**
 * Avatar presence indicator (top-right of profile photo):
 * - Online only → hero-orange dot
 * - Available only → hero-orange lightning bolt
 * - Both → hero-orange dot with white lightning inside
 *
 * Sizing is proportional to the closest positioned ancestor (avatar wrapper).
 */
export function OnlineDot({
  online,
  availableNow = false,
  position = "top-right",
  className,
}: Props) {
  const isOnline = Boolean(online);
  const isAvailable = Boolean(availableNow);

  if (!isOnline && !isAvailable) return null;

  const positionClass = POSITION_CLASS[position];

  if (isOnline && isAvailable) {
    return (
      <span
        aria-label="Online now and available now"
        title="Online now · Available now"
        style={SIZE_STYLE}
        className={cn(
          "pointer-events-none absolute flex items-center justify-center rounded-full border-2 border-white bg-convene-online shadow-sm",
          positionClass,
          className,
        )}
      >
        <Zap
          className="h-[58%] w-[58%] min-h-[5px] min-w-[5px] fill-white text-white"
          strokeWidth={2.5}
          aria-hidden
        />
      </span>
    );
  }

  if (isOnline) {
    return (
      <span
        aria-label="Online now"
        title="Online now"
        style={SIZE_STYLE}
        className={cn(
          "pointer-events-none absolute rounded-full border-2 border-white bg-convene-online shadow-sm",
          positionClass,
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-label="Available now"
      title="Available now"
      style={SIZE_STYLE}
      className={cn("pointer-events-none absolute flex items-center justify-center", positionClass, className)}
    >
      <Zap
        className="h-full w-full fill-convene-hero text-convene-hero drop-shadow-sm"
        strokeWidth={2}
        aria-hidden
      />
    </span>
  );
}

type PillProps = {
  online: boolean | null | undefined;
  className?: string;
};

/**
 * "Online now" pill rendered under a profile photo. Uses hero orange
 * (--convene-online / --convene-hero) so the badge and dot match across the app.
 * Returns null when the user is not online.
 */
export function OnlineNowPill({ online, className }: PillProps) {
  if (!online) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-convene-online px-2.5 py-1 text-xs font-semibold text-white shadow-sm",
        className,
      )}
    >
      <span className="h-2 w-2 rounded-full bg-white" />
      Online now
    </span>
  );
}

type AvailablePillProps = {
  availableNow: boolean | null | undefined;
  className?: string;
};

/** "Available now" pill with hero-orange lightning (when not shown on avatar alone). */
export function AvailableNowPill({ availableNow, className }: AvailablePillProps) {
  if (!availableNow) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-convene-hero px-2.5 py-1 text-xs font-semibold text-white shadow-sm",
        className,
      )}
    >
      <Zap className="h-3 w-3 fill-white text-white" strokeWidth={2.5} aria-hidden />
      Available now
    </span>
  );
}
