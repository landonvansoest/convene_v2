"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AdvancedSearchDialog } from "@/components/search/AdvancedSearchDialog";
import { BrowseCategoriesDialog } from "@/components/search/BrowseCategoriesDialog";
import { PostRequestDialog } from "@/components/requests/PostRequestDialog";
import { SignInDialog } from "@/components/auth/SignInDialog";
import { SignUpDialog } from "@/components/auth/SignUpDialog";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/** Bible `/about`: Ready to Get Started — advanced search, browse categories, post request (pop-ups). */
export function AboutReadySection() {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signUpOpen, setSignUpOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const sb = createBrowserSupabase();
      void sb.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
      const { data: sub } = sb.auth.onAuthStateChange((_e, sess) => setSignedIn(!!sess));
      return () => sub.subscription.unsubscribe();
    } catch {
      setSignedIn(false);
      return;
    }
  }, []);

  function openPostRequest() {
    if (signedIn !== true) {
      setSignInOpen(true);
      return;
    }
    setPostOpen(true);
  }

  return (
    <>
      <div className="bg-[#003049] py-8">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <h2 className="mb-6 text-4xl font-bold text-[#F77F00]">Ready to Get Started?</h2>
          <div className="flex flex-col justify-center gap-4 sm:flex-row sm:flex-wrap">
            <Button
              size="lg"
              className="bg-[#F77F00] px-8 text-white hover:bg-[#F77F00]/90"
              type="button"
              onClick={() => setAdvancedOpen(true)}
            >
              Find an Expert
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white px-8 text-white hover:bg-white/10"
              type="button"
              onClick={() => setBrowseOpen(true)}
            >
              Browse Categories
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white px-8 text-white hover:bg-white/10"
              type="button"
              onClick={() => openPostRequest()}
            >
              Post a Request
            </Button>
          </div>
        </div>
      </div>

      <AdvancedSearchDialog open={advancedOpen} onOpenChange={setAdvancedOpen} initialKeywords="" />
      <BrowseCategoriesDialog open={browseOpen} onOpenChange={setBrowseOpen} />
      <PostRequestDialog open={postOpen} onOpenChange={setPostOpen} />
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        description="You must be signed in to post a request. Sign in now or create a free account to get started."
        onRequestSignUp={() => {
          setSignInOpen(false);
          setSignUpOpen(true);
        }}
      />
      <SignUpDialog
        open={signUpOpen}
        onOpenChange={setSignUpOpen}
        onRequestSignIn={() => {
          setSignUpOpen(false);
          setSignInOpen(true);
        }}
      />
    </>
  );
}
