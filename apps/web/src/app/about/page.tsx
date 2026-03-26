import Link from "next/link";
import { AboutReadySection } from "@/components/about/AboutReadySection";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Users, Calendar, MessageSquare } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-white py-8">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="rounded-2xl bg-[#003049] p-6 md:p-8 lg:p-10">
            <div className="space-y-4 text-left">
              <h1 className="text-4xl font-black leading-tight tracking-tight text-white md:text-5xl lg:text-6xl">
                Find an <span className="text-primary font-black">EXPERT</span>
                <span className="text-primary">.</span> Book a{" "}
                <span className="text-primary font-black">SESSION</span>
                <span className="text-primary">.</span> Chat{" "}
                <span className="text-primary font-black">LIVE</span>
                <span className="text-primary">.</span>
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
                Getting started with Convene is simple. Here&apos;s how you can connect with an expert today.
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

      <div className="bg-white py-8">
        <div className="container mx-auto max-w-4xl px-4">
          <div className="mb-8 text-left">
            <h2 className="text-4xl font-bold text-[#003049]">FAQs</h2>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="cost" className="rounded-lg border border-[#003049]/20 px-6">
              <AccordionTrigger className="text-left font-semibold hover:no-underline">
                How much do sessions cost?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Each expert sets their own rates based on their experience and expertise. Rates typically range from
                $25-$500 per hour. You&apos;ll see the exact price for your selected session duration before confirming
                your booking. Many experts also offer package deals and first-session discounts.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="cancel" className="rounded-lg border border-[#003049]/20 px-6">
              <AccordionTrigger className="text-left font-semibold hover:no-underline">
                What if I need to reschedule or cancel?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                You can reschedule or cancel sessions from your dashboard. Cancellation policies vary by expert, but
                most offer free cancellation up to 24 hours before the session. Check the expert&apos;s specific
                cancellation policy on their profile page.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="video" className="rounded-lg border border-[#003049]/20 px-6">
              <AccordionTrigger className="text-left font-semibold hover:no-underline">
                How do the video sessions work?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Sessions are conducted through our integrated video platform. At your scheduled time, simply join from
                your dashboard — no downloads or special software required. You can use your camera, microphone, share
                your screen, and chat in real-time with your expert.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="verified" className="rounded-lg border border-[#003049]/20 px-6">
              <AccordionTrigger className="text-left font-semibold hover:no-underline">
                How are experts verified?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                All experts on Convene go through a verification process where we review their credentials, experience,
                and professional background. Verified experts display a verification badge on their profile. We also
                monitor expert ratings and reviews to ensure quality standards are maintained.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="message" className="rounded-lg border border-[#003049]/20 px-6">
              <AccordionTrigger className="text-left font-semibold hover:no-underline">
                Can I message an expert before booking?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                This depends on the expert&apos;s preferences. Some experts allow messaging before booking, while others
                prefer to only communicate with confirmed bookings. You&apos;ll see the expert&apos;s messaging
                preferences on their profile page.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="become" className="rounded-lg border border-[#003049]/20 px-6">
              <AccordionTrigger className="text-left font-semibold hover:no-underline">
                How do I become an expert on Convene?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Click &quot;Become an Expert&quot; in the header to get started. You&apos;ll complete a profile setup
                wizard where you add your credentials, set your availability, and configure your booking preferences.
                Once your profile is complete, you can start receiving booking requests from learners.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="pay" className="rounded-lg border border-[#003049]/20 px-6">
              <AccordionTrigger className="text-left font-semibold hover:no-underline">
                What payment methods do you accept?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                We accept all major credit cards and debit cards through our secure payment processor Stripe. Payment
                is processed when you confirm your booking, and you&apos;ll receive a receipt via email.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      <AboutReadySection />

      <div className="bg-white py-12">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div>
              <h4 className="mb-4 font-semibold text-[#003049]">Quick Links</h4>
              <ul className="space-y-2 text-[#003049]/80">
                <li>
                  <Link href="/" className="hover:text-[#003049]">
                    Home
                  </Link>
                </li>
                <li>
                  <Link href="/search" className="hover:text-[#003049]">
                    Find Experts
                  </Link>
                </li>
                <li>
                  <Link href="/become-expert" className="hover:text-[#003049]">
                    Become an Expert
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="hover:text-[#003049]">
                    About Us
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 font-semibold text-[#003049]">Contact</h4>
              <ul className="space-y-2 text-[#003049]/80">
                <li>support@convene.com</li>
                <li>1-800-CONVENE</li>
              </ul>
            </div>
            <div />
          </div>
          <div className="mt-8 border-t border-[#003049]/20 pt-8 text-center text-[#003049]/60">
            <p>&copy; {new Date().getFullYear()} Convene. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
