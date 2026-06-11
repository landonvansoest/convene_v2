"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SignInDialog } from "@/components/auth/SignInDialog";
import { ContactSupportDialog } from "@/components/support/ContactSupportDialog";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function SiteFooter() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [hasExpertProfile, setHasExpertProfile] = useState<boolean>(false);
  const [showResources, setShowResources] = useState(true);
  const [signInOpen, setSignInOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    try {
      const sb = createBrowserSupabase();
      void sb.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
      const { data: sub } = sb.auth.onAuthStateChange((_e, sess) => {
        setSignedIn(!!sess);
      });
      return () => sub.subscription.unsubscribe();
    } catch {
      setSignedIn(false);
      return;
    }
  }, []);

  useEffect(() => {
    void fetch("/api/footer-settings")
      .then(async (r) => (r.ok ? ((await r.json()) as { settings?: { show_resources_links?: boolean } }) : null))
      .then((data) => setShowResources(Boolean(data?.settings?.show_resources_links ?? true)))
      .catch(() => setShowResources(true));
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setHasExpertProfile(false);
      return;
    }
    void fetch("/api/me")
      .then(async (r) => (r.ok ? ((await r.json()) as { profile?: Record<string, unknown> | null }) : null))
      .then((data) => setHasExpertProfile(Boolean(data?.profile?.has_expert_profile)))
      .catch(() => setHasExpertProfile(false));
  }, [signedIn]);

  function onBecomeExpert() {
    if (signedIn !== true) {
      setSignInOpen(true);
      return;
    }
    if (hasExpertProfile) {
      router.push("/dashboard?view=community-requests");
      return;
    }
    router.push("/become-expert");
  }

  return (
    <>
      <footer className="relative z-10 shrink-0 border-t border-border bg-card">
        <div className="mx-auto grid w-full max-w-screen-2xl grid-cols-1 gap-6 px-6 py-10 md:grid-cols-[220px_220px_220px] md:justify-start md:gap-6 md:px-6">
          <div className="text-left">
            <h4 className="mb-3 text-base font-semibold text-convene-primary">Support</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/about" className="text-muted-foreground hover:text-convene-primary">
                  About convene
                </Link>
              </li>
              <li>
                <Link href="/about#faq" className="text-muted-foreground hover:text-convene-primary">
                  FAQs
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onBecomeExpert}
                  className="text-left text-muted-foreground hover:text-convene-primary"
                >
                  Become an Expert
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setContactOpen(true)}
                  className="text-left text-muted-foreground hover:text-convene-primary"
                >
                  Contact Us
                </button>
              </li>
            </ul>
          </div>

          <div className="text-left">
            {showResources ? (
              <>
                <h4 className="mb-3 text-base font-semibold text-convene-primary">Resources</h4>
                <ul className="space-y-2 text-sm">
                  <li>
                    <Link href="/about#resources" className="text-muted-foreground hover:text-convene-primary">
                      For users
                    </Link>
                  </li>
                  <li>
                    <Link href="/about#resources" className="text-muted-foreground hover:text-convene-primary">
                      For experts
                    </Link>
                  </li>
                </ul>
                <p className="mt-3 text-sm italic text-muted-foreground">
                  Learn how to get the most of your convene sessions
                </p>
              </>
            ) : null}
          </div>

          <div className="text-left">
            <h4 className="mb-3 text-base font-semibold text-convene-primary">Connect with us</h4>
            <div className="flex items-center gap-3">
              <a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-muted-foreground hover:text-convene-primary"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37a4 4 0 1 1-1.37-1.37 4 4 0 0 1 1.37 1.37z" />
                  <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
                </svg>
              </a>
              <a href="https://facebook.com" target="_blank" rel="noreferrer" aria-label="Facebook">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-muted-foreground hover:text-convene-primary"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                </svg>
              </a>
              <a href="https://twitter.com" target="_blank" rel="noreferrer" aria-label="Twitter">
                <span className="inline-flex h-5 w-5 items-center justify-center text-sm font-semibold text-muted-foreground hover:text-convene-primary">
                  X
                </span>
              </a>
            </div>
          </div>
        </div>
      </footer>

      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        description="You must sign in or register to become an expert."
      />

      <ContactSupportDialog open={contactOpen} onOpenChange={setContactOpen} />
    </>
  );
}

