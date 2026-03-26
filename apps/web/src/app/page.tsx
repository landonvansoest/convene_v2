import { HomeCategoryNav } from "@/components/home/HomeCategoryNav";
import { FeaturedExperts } from "@/components/home/FeaturedExperts";
import { HomeHero } from "@/components/home/HomeHero";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <HomeCategoryNav />
      <HomeHero />
      <FeaturedExperts />
    </div>
  );
}
