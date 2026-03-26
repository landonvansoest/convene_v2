"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SKILLS_BY_CATEGORY } from "@/components/search/skillsByCategory";

type Cat = { category_id: string; name: string; icon: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BrowseCategoriesDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [categories, setCategories] = useState<Cat[]>([]);

  useEffect(() => {
    if (!open) return;
    let c = false;
    void fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => {
        if (!c) setCategories((d.categories as Cat[]) ?? []);
      })
      .catch(() => {
        if (!c) setCategories([]);
      });
    return () => {
      c = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-[#003049]">
            <LayoutGrid className="h-5 w-5" />
            Browse categories
          </DialogTitle>
          <DialogDescription>
            Pick a category to see experts in that area (same flow as v1 categories pop-up).
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 py-2">
          {categories.map((cat) => {
            const hints = SKILLS_BY_CATEGORY[cat.name]?.slice(0, 6).join(" · ");
            return (
              <li key={cat.category_id}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start border-[#003049]/20 px-4 py-3 text-left hover:bg-[#003049]/5"
                  onClick={() => {
                    router.push(`/search?category=${encodeURIComponent(cat.category_id)}`);
                    onOpenChange(false);
                  }}
                >
                  <span className="mr-3 text-2xl leading-none">{cat.icon?.trim() || "·"}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-semibold text-[#003049]">{cat.name}</span>
                    {hints ? <span className="text-xs font-normal text-muted-foreground">{hints}</span> : null}
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
