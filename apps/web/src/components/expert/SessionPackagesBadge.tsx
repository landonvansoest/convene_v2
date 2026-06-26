import { Layers } from "lucide-react";
import { isSessionPackagesAdvertised, type PackageDealDisplayInput } from "@/lib/packages/package-deal";
import { cn } from "@/lib/utils";

type Props = {
  expert: PackageDealDisplayInput | null | undefined;
  /** When set, also show if the expert has published sellable packages. */
  publishedPackageCount?: number;
  className?: string;
};

export function SessionPackagesBadge({ expert, publishedPackageCount = 0, className }: Props) {
  const advertised = isSessionPackagesAdvertised(expert) || publishedPackageCount > 0;
  if (!advertised) return null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-convene-primary px-2 py-1 text-xs font-semibold text-white",
        className,
      )}
      title="Multi-session packages available"
    >
      <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Session Packages
    </span>
  );
}
