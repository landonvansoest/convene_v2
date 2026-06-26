import { Tag } from "lucide-react";
import {
  firstSessionDiscountBadgeLabel,
  isFirstSessionDiscountAdvertised,
  type FirstSessionDiscountDisplayInput,
} from "@/lib/pricing/first-session-discount";
import { cn } from "@/lib/utils";

type Props = {
  expert: FirstSessionDiscountDisplayInput | null | undefined;
  className?: string;
};

export function FirstSessionDiscountBadge({ expert, className }: Props) {
  if (!isFirstSessionDiscountAdvertised(expert)) return null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-convene-primary px-2 py-1 text-xs font-semibold text-white",
        className,
      )}
      title="Discount for your first paid session with this expert"
    >
      <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {firstSessionDiscountBadgeLabel(expert)}
    </span>
  );
}
