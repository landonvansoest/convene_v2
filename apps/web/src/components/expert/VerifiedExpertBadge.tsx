import Image from "next/image";
import { cn } from "@/lib/utils";

type IconProps = {
  size?: number;
  className?: string;
  /** Adds a white outline around the star when the icon sits on hero-orange */
  onOrangeBackground?: boolean;
};

/** Check + star verification mark from `/verification-badge.png`. */
export function VerifiedExpertIcon({
  size = 14,
  className,
  onOrangeBackground = false,
}: IconProps) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {onOrangeBackground ? (
        <Image
          src="/verification-badge.png"
          alt=""
          width={size}
          height={size}
          className="absolute inset-0 h-full w-full scale-[1.2] brightness-0 invert"
          aria-hidden
        />
      ) : null}
      <Image
        src="/verification-badge.png"
        alt=""
        width={size}
        height={size}
        className="relative h-full w-full"
        aria-hidden
      />
    </span>
  );
}

type BadgeProps = {
  className?: string;
};

/** Hero-orange pill with the verification badge icon (check + star outline). */
export function VerifiedExpertBadge({ className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-convene-hero px-2 py-1 text-xs font-semibold text-white",
        className,
      )}
    >
      <VerifiedExpertIcon size={14} onOrangeBackground />
      Verified Expert
    </span>
  );
}

/** Corner overlay for profile photos (featured grid, etc.). */
export function VerifiedExpertPhotoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute right-2 top-2 z-[5] flex h-8 w-8 items-center justify-center rounded-full bg-convene-hero shadow-md",
        className,
      )}
      aria-label="Verified Expert"
      title="Verified Expert"
    >
      <VerifiedExpertIcon size={24} onOrangeBackground />
    </span>
  );
}
