import { isExpertVisibleTemp } from "@/lib/expertVisibilityState";
import { cn } from "@/lib/utils";

type Props = {
  expertVisibilityState: string | null | undefined;
  className?: string;
  /** `avatar` overlays the photo; `inline` sits after the expert name. */
  variant?: "avatar" | "inline";
};

/**
 * Red dot when `expert_visibility_state` is `visible_temp`.
 * Use `variant="avatar"` as a sibling inside a `relative` photo wrapper (OnlineDot pattern),
 * or `variant="inline"` immediately after the expert's name.
 */
export function VisibleTempDot({
  expertVisibilityState,
  className,
  variant = "avatar",
}: Props) {
  if (!isExpertVisibleTemp(expertVisibilityState)) return null;

  if (variant === "inline") {
    return (
      <span
        aria-label="Temporary expert profile"
        title="Temporary expert profile"
        className={cn("inline-block h-2 w-2 shrink-0 rounded-full bg-red-500", className)}
      />
    );
  }

  return (
    <span
      aria-label="Temporary expert profile"
      title="Temporary expert profile"
      style={{
        width: "6.5%",
        height: "6.5%",
        minWidth: "2.5px",
        minHeight: "2.5px",
      }}
      className={cn(
        "pointer-events-none absolute bottom-[1.5%] right-[1.5%] rounded-full bg-red-500 shadow-sm",
        className,
      )}
    />
  );
}
