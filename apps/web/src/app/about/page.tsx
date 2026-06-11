import { AboutFaqsSection } from "@/components/about/AboutFaqsSection";
import { AboutReadySection } from "@/components/about/AboutReadySection";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, MessageSquare } from "lucide-react";

/** FAQs and other CMS-backed content must reflect admin edits without a rebuild. */
export const dynamic = "force-dynamic";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <div id="faq" className="bg-white py-8">
        <div className="container mx-auto max-w-6xl px-4">
          {/* `overflow-hidden` is a safety net: any future inner content
              that ends up too wide for the viewport gets clipped to the
              rounded navy panel instead of escaping onto the white page
              background where it would be unreadable. */}
          <div className="overflow-hidden rounded-2xl bg-[#003049] p-6 md:p-8 lg:p-10">
            <div className="space-y-4 text-left">
              {/* `break-words` + no `whitespace-nowrap` keeps the heading
                  inside the navy panel even when the viewport is just a
                  touch narrower than the single-line layout would need.
                  Previously `lg:whitespace-nowrap` forced one line at 52px
                  and the trailing "LIVE." spilled past the right edge. */}
              <h1 className="break-words text-3xl font-black leading-tight tracking-tight text-white md:text-4xl lg:text-[52px]">
                Find an <span className="text-primary font-black">EXPERT</span>. Book a{" "}
                <span className="text-primary font-black">SESSION</span>. Chat{" "}
                <span className="text-primary font-black">LIVE</span>.
              </h1>
              <h2 className="text-base font-bold text-white md:text-lg">
                Stuck on a project? Looking to sharpen your skills? Tired of waiting for tech support?
              </h2>
              <div className="space-y-3 text-sm text-white/90 md:text-base">
                <p>
                  Welcome to Convene. We have a broad range of experts ready to coach you in a face-to-face video
                  call. Just ask a question in the search box to find relevant experts, select your coach, and book
                  time to talk.
                </p>
                <p>
                  Still have questions? Check out our FAQs below or contact us, we&apos;d love to hear from you.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 py-8">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="rounded-2xl border-2 border-[#003049] bg-white p-6 md:p-8">
            <div className="mb-8 text-center">
              <h2 className="mb-4 text-4xl font-bold text-[#003049]">How It Works</h2>
              <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                Getting started with convene is simple. Join our community and follow these steps to start consulting
                with a live, human expert today.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <Card className="border-2 border-[#003049]/20 transition-colors hover:border-[#003049]/40">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#003049]">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">Find an Expert</CardTitle>
                  <CardDescription>
                    Search by skill or simply ask a question. Alternatively, you can post a question to the marketplace
                    and have Experts come to you.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-2 border-[#F77F00]/20 transition-colors hover:border-[#F77F00]/40">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#F77F00]">
                    <Calendar className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">Book a Session</CardTitle>
                  <CardDescription>
                    Choose a time that works for you from the expert&apos;s calendar. Sessions are flexible and can be
                    customized to your needs.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-2 border-[#003049]/20 transition-colors hover:border-[#003049]/40">
                <CardHeader>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#003049]">
                    <MessageSquare className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">Chat Live</CardTitle>
                  <CardDescription>
                    Connect via video call at your scheduled time. Get personalized guidance, ask questions, and learn
                    directly from an expert.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <AboutFaqsSection />

      <div id="resources" className="bg-gray-50 py-8">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="rounded-2xl border-2 border-[#003049]/20 bg-white p-6 md:p-8">
            <h2 className="mb-6 text-4xl font-bold text-[#003049]">Resources</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-lg border border-[#003049]/15 p-5">
                <h3 className="text-2xl font-semibold text-[#003049]">For users</h3>
                <p className="mt-3 text-sm text-muted-foreground">
                  Learn how to prepare before each session, ask focused questions, and follow up effectively so every
                  minute with your expert turns into practical progress.
                </p>
              </div>
              <div className="rounded-lg border border-[#003049]/15 p-5">
                <h3 className="text-2xl font-semibold text-[#003049]">For experts</h3>
                <p className="mt-3 text-sm text-muted-foreground">
                  Discover ways to structure sessions, set clear outcomes, and create a consistent consulting
                  experience that helps learners succeed and keeps your profile in high demand.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AboutReadySection />

    </div>
  );
}
