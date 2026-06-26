"use client";

import { useRouter } from "next/navigation";
import {
  Briefcase,
  ChefHat,
  Code,
  Coffee,
  GraduationCap,
  Headphones,
  Heart,
  Palette,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { dispatchSearchLoading } from "@/lib/search/search-loading-events";

const categories = [
  { name: "Health + Wellness", icon: Heart },
  { name: "Home Improvement", icon: Wrench },
  { name: "Culinary", icon: ChefHat },
  { name: "Technical Support", icon: Headphones },
  { name: "Tutoring", icon: GraduationCap },
  { name: "Beauty", icon: Sparkles },
  { name: "Arts, Music, Design", icon: Palette },
  { name: "App + Web Development", icon: Code },
  { name: "Business + Marketing", icon: Briefcase },
  { name: "Everyday", icon: Coffee },
];

export function HomeCategoryNav() {
  const router = useRouter();

  function handleCategoryClick(categoryName: string) {
    // Pass display name; search page resolves this to a category UUID.
    dispatchSearchLoading(true);
    router.push(`/search?category=${encodeURIComponent(categoryName)}`);
  }

  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto w-full max-w-screen-2xl px-4 md:px-6">
        <div className="scrollbar-hide flex gap-1 overflow-x-auto py-3">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <Button
                key={category.name}
                type="button"
                variant="ghost"
                onClick={() => handleCategoryClick(category.name)}
                className="flex h-auto min-w-[120px] flex-col items-center gap-2 px-4 py-3 transition-colors hover:bg-accent/50"
              >
                <Icon className="h-6 w-6 text-muted-foreground" />
                <span className="whitespace-normal text-center text-xs font-medium leading-tight">
                  {category.name}
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
