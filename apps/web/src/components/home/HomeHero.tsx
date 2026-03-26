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

      <div className="relative z-10 mx-auto w-full max-w-screen-2xl px-4 py-8 md:px-6 md:py-12">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div className="animate-fade-in space-y-6 pl-4 md:pl-8 lg:pl-16">
            <h1 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-7xl">
              Find an <span className="text-primary font-black">EXPERT</span>
              <span className="text-primary">.</span>
              <br />
              Book a <span className="text-primary font-black">SESSION</span>
              <span className="text-primary">.</span>
              <br />
              Chat <span className="text-primary font-black">LIVE</span>
              <span className="text-primary">.</span>
            </h1>
            <p className="max-w-xl text-lg font-medium text-white/90 md:text-xl">
              Get help with anything,
              <br />
              one-on-one with a personal coach.
            </p>
            <Button
              asChild
              size="lg"
              className="group mt-6 rounded-full bg-primary px-8 py-3 font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Link href="/about">
                Learn More
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>

          <div className="relative flex animate-scale-in items-center justify-center">
            <div className="relative w-full max-w-2xl">
              <Image
                src="/hero-illustration.png"
                alt="Coaching and collaboration illustration"
                width={1200}
                height={900}
                className="relative z-10 h-auto w-full object-contain drop-shadow-2xl"
                priority
              />
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
