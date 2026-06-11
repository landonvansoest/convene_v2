import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HomeHero() {
  return (
    <section
      className="relative overflow-hidden text-white"
      style={{ backgroundColor: "hsl(199, 100%, 14%)" }}
    >
      <div className="absolute top-0 right-0 h-full w-1/2 bg-gray-100" />
      <div className="absolute top-0 right-0 h-full w-1/2">
        <div
          className="absolute top-0 left-0 h-full w-32"
          style={{
            backgroundColor: "hsl(199, 100%, 14%)",
            clipPath: "ellipse(80px 100% at 0% 50%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-screen-2xl px-4 py-5 md:px-6 md:py-6">
        {/*
          Force a two-column grid at every breakpoint so the hero illustration
          can never drop below the copy. At narrow widths the image column
          shrinks and `object-cover` crops into the graphic instead of letting
          it letterbox or wrap underneath the text.
        */}
        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-4 md:gap-6 lg:min-h-[390px] lg:grid-cols-2">
          <div className="animate-fade-in space-y-5 pl-4 md:pl-10 lg:pl-24">
            <h1 className="text-5xl font-black leading-[0.95] tracking-tight md:text-6xl lg:text-[74px]">
              Find an <span className="text-primary font-black">EXPERT</span>
              <span className="text-primary">.</span>
              <br />
              Book a <span className="text-primary font-black">SESSION</span>
              <span className="text-primary">.</span>
              <br />
              Chat <span className="text-primary font-black">LIVE</span>
              <span className="text-primary">.</span>
            </h1>
            <p className="max-w-xl text-lg font-medium leading-tight text-white/90 md:text-xl lg:text-2xl">
              Get help with anything,
              <br />
              one-on-one with a personal coach.
            </p>
            <Button
              asChild
              size="lg"
              className="group mt-3 rounded-full bg-primary px-8 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Link href="/about">
                Learn More
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>

          <div className="relative flex animate-scale-in items-center justify-center">
            <div className="relative w-full max-w-2xl drop-shadow-2xl">
              <div className="relative aspect-[4/3] w-full overflow-hidden">
                <Image
                  src="/hero-illustration.png"
                  alt="Coaching and collaboration illustration"
                  fill
                  sizes="(min-width: 1024px) 600px, 45vw"
                  className="object-cover object-center"
                  priority
                />
              </div>
              <div className="absolute -top-4 -right-4 h-12 w-12 animate-pulse rounded-full bg-primary opacity-20" />
              <div className="absolute -bottom-8 -left-8 h-16 w-16 animate-pulse rounded-full bg-accent opacity-15 [animation-delay:500ms]" />
              <div className="absolute top-1/4 -left-6 h-8 w-8 animate-bounce rounded-full bg-secondary opacity-25 [animation-delay:1s]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
