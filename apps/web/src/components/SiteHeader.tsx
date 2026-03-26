"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Briefcase,
  Calendar,
  ChevronDown,
  GraduationCap,
  LayoutGrid,
  LogIn,
  Mail,
  Menu,
  MessageSquare,
  Search,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { SignInDialog } from "@/components/auth/SignInDialog";
import { SignUpDialog } from "@/components/auth/SignUpDialog";
import { AdvancedSearchDialog } from "@/components/search/AdvancedSearchDialog";
import { BrowseCategoriesDialog } from "@/components/search/BrowseCategoriesDialog";
import { PostRequestDialog } from "@/components/requests/PostRequestDialog";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchMenu, setShowSearchMenu] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [hasExpertProfile, setHasExpertProfile] = useState<boolean>(false);
  const [nextSessionCountdown, setNextSessionCountdown] = useState<{
    hours: number;
    minutes: number;
    totalMinutes: number;
  } | null>(null);
  const [bookedSessionsCount, setBookedSessionsCount] = useState(0);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signUpOpen, setSignUpOpen] = useState(false);
  const [signInDescription, setSignInDescription] = useState<string | null>(null);
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [browseCategoriesOpen, setBrowseCategoriesOpen] = useState(false);
  const [postRequestOpen, setPostRequestOpen] = useState(false);

  useEffect(() => {
    try {
      const sb = createBrowserSupabase();
      void sb.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
      const { data: sub } = sb.auth.onAuthStateChange((_e, sess) => {
        setSignedIn(!!sess);
      });
      return () => sub.subscription.unsubscribe();
    } catch {
      // If env vars are missing, keep the header usable (no auth badges),
      // and let the app still route normally.
      setSignedIn(false);
      return;
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void fetch("/api/me")
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as { profile?: Record<string, unknown> | null } | null;
      })
      .then((data) => {
        const p = (data?.profile ?? null) as Record<string, unknown> | null;
        const photo = p?.profile_photo;
        setProfilePhoto(typeof photo === "string" && photo.trim() ? photo : null);
        setHasExpertProfile(Boolean(p?.has_expert_profile));
      })
      .catch(() => {
        setProfilePhoto(null);
        setHasExpertProfile(false);
      });
  }, [signedIn]);

  useEffect(() => {
    // Bible-driven header badges:
    // - Next session countdown
    // - Booked sessions badge (expert actions)
    // - Inbox unread badge
    if (!signedIn) return;

    let cancelled = false;

    async function loadBadges() {
      setNextSessionCountdown(null);
      setBookedSessionsCount(0);
      setInboxUnreadCount(0);

      const [unreadRes, sessionsRes] = await Promise.allSettled([
        fetch("/api/messages/unread/count"),
        fetch("/api/sessions?type=upcoming"),
      ]);

      if (cancelled) return;

      if (unreadRes.status === "fulfilled" && unreadRes.value.ok) {
        try {
          const data = (await unreadRes.value.json()) as { count?: number };
          setInboxUnreadCount(typeof data?.count === "number" ? data.count : 0);
        } catch {
          setInboxUnreadCount(0);
        }
      }

      if (sessionsRes.status === "fulfilled" && sessionsRes.value.ok) {
        try {
          const data = (await sessionsRes.value.json()) as { sessions?: Array<Record<string, unknown>> };
          const sessions = Array.isArray(data?.sessions) ? data.sessions : [];

          const nowMs = Date.now();
          let bestNext: { hours: number; minutes: number; totalMinutes: number } | null = null;
          let bookedCount = 0;

          for (const s of sessions) {
            const status = s.status as string | undefined;
            const paymentStatus = s.payment_status as string | undefined;
            const userRole = s.user_role as string | undefined;

            if (
              hasExpertProfile &&
              userRole === "expert" &&
              status === "upcoming" &&
              paymentStatus !== "paid"
            ) {
              bookedCount += 1;
            }

            if (status !== "upcoming" || paymentStatus !== "paid") continue;

            const sessionDate = s.session_date as string | undefined;
            const startTime = s.start_time as string | undefined;
            if (!sessionDate || !startTime) continue;

            const startMs = new Date(`${sessionDate}T${startTime}`).getTime();
            if (!Number.isFinite(startMs)) continue;

            const diffMs = startMs - nowMs;
            if (diffMs <= 0) continue;

            const totalMinutes = Math.floor(diffMs / 60000);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;

            if (!bestNext || totalMinutes < bestNext.totalMinutes) {
              bestNext = { hours, minutes, totalMinutes };
            }
          }

          setBookedSessionsCount(bookedCount);
          setNextSessionCountdown(bestNext);
        } catch {
          setBookedSessionsCount(0);
          setNextSessionCountdown(null);
        }
      }
    }

    void loadBadges();

    return () => {
      cancelled = true;
    };
  }, [signedIn, hasExpertProfile]);

  if (pathname === "/login") return null;

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      // Match v1 routing contract: /search?q=...
      router.push(`/search?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/search");
    }
  }

  async function signOut() {
    let sb: ReturnType<typeof createBrowserSupabase> | null = null;
    try {
      sb = createBrowserSupabase();
    } catch {
      sb = null;
    }

    if (sb) {
      await sb.auth.signOut();
    }
    window.location.href = "/";
  }

  function openSignIn(description?: string | null) {
    setSignInDescription(description ?? null);
    setSignInOpen(true);
  }

  function openPostRequestFromMenu() {
    setShowSearchMenu(false);
    if (signedIn !== true) {
      openSignIn(
        "You must be signed in to post a request. Sign in now or create a free account to get started."
      );
      return;
    }
    setPostRequestOpen(true);
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-primary">convene</span>
          </Link>
        </div>

        {/* Desktop search bar (v1/Bible): input + hamburger dropdown */}
        <form onSubmit={onSearch} className="hidden max-w-2xl flex-1 px-4 md:flex">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Find an Expert or Ask a Question"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border-border pl-10 pr-12"
              aria-label="Search experts"
            />

            <DropdownMenu open={showSearchMenu} onOpenChange={setShowSearchMenu}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-accent transition-colors"
                  aria-label="Search menu"
                >
                  <Menu className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onSelect={() => {
                    setShowSearchMenu(false);
                    setAdvancedSearchOpen(true);
                  }}
                >
                  <Search className="mr-2 h-4 w-4" />
                  Advanced Search
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setShowSearchMenu(false);
                    setBrowseCategoriesOpen(true);
                  }}
                >
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Browse categories
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    openPostRequestFromMenu();
                  }}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Post a Request
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </form>

        {/* Upper-right header badges + user dropdown (v1/Bible) */}
        <div className="flex items-center gap-3">
          {/* Next Session Countdown Badge */}
          {signedIn && nextSessionCountdown && (
            <>
              {/* Desktop version */}
              <div className="hidden lg:flex items-center">
                <div
                  className="bg-[#003049] text-white rounded-md px-2.5 py-1 leading-none font-medium text-center cursor-pointer hover:opacity-90"
                  role="button"
                  aria-label="View booked sessions"
                  onClick={() => router.push("/dashboard?view=sessions")}
                >
                  <div className="text-[10px] opacity-90 leading-none text-center">Next session in:</div>
                  <div className="text-center">
                    {nextSessionCountdown.hours > 0 ? (
                      <>
                        <span className="text-xs font-semibold">{nextSessionCountdown.hours}</span>
                        <span className="text-[10px] ml-0.5">hr</span>
                        <span className="text-xs font-semibold ml-1">{nextSessionCountdown.minutes}</span>
                        <span className="text-[10px] ml-0.5">min</span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-semibold">{nextSessionCountdown.minutes}</span>
                        <span className="text-[10px] ml-0.5">min</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Mobile version */}
              <div className="lg:hidden flex items-center">
                <div
                  className="bg-[#003049] text-white rounded-md px-2 py-0.5 leading-none font-medium text-center cursor-pointer hover:opacity-90"
                  role="button"
                  aria-label="View booked sessions"
                  onClick={() => router.push("/dashboard?view=sessions")}
                >
                  <div className="text-[9px] opacity-90 leading-none text-center">Next session in:</div>
                  <div className="text-center">
                    {nextSessionCountdown.hours > 0 ? (
                      <>
                        <span className="text-[11px] font-semibold">{nextSessionCountdown.hours}</span>
                        <span className="text-[9px] ml-0.5">hr</span>
                        <span className="text-[11px] font-semibold ml-1">{nextSessionCountdown.minutes}</span>
                        <span className="text-[9px] ml-0.5">min</span>
                      </>
                    ) : (
                      <>
                        <span className="text-[11px] font-semibold">{nextSessionCountdown.minutes}</span>
                        <span className="text-[9px] ml-0.5">min</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Booked Sessions Indicator - Shows count of actions required / new bookings */}
          {signedIn && bookedSessionsCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="relative hover:bg-transparent"
              onClick={() => router.push("/dashboard?view=sessions")}
              title="Booked Sessions - Actions Required"
            >
              <Calendar className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-semibold">
                {bookedSessionsCount}
              </span>
            </Button>
          )}

          {/* Unread Messages Indicator */}
          {signedIn && inboxUnreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="relative hover:bg-transparent"
              onClick={() => router.push("/dashboard?view=inbox")}
            >
              <Mail className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-semibold">
                {inboxUnreadCount}
              </span>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="relative h-10 rounded-full px-2 hover:bg-transparent"
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-9 w-9 border-2 border-primary/20">
                    <AvatarImage src={profilePhoto ?? undefined} alt="User" />
                    <AvatarFallback className="bg-[#F77F00] text-white">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              {!signedIn ? (
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      openSignIn(null);
                    }}
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    Sign in
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setSignUpOpen(true);
                    }}
                  >
                    <User className="mr-2 h-4 w-4" />
                    Sign up
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      router.push("/requests");
                    }}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Community message board
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      openSignIn("You must sign in or register to become an expert.");
                    }}
                  >
                    <User className="mr-2 h-4 w-4" />
                    Become an Expert
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      router.push("/about");
                    }}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Learn More
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      router.push("/dashboard?view=sessions");
                    }}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      router.push("/dashboard?view=overview");
                    }}
                  >
                    <GraduationCap className="mr-2 h-4 w-4" />
                    Switch to Learning
                  </DropdownMenuItem>
                  {hasExpertProfile ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        router.push("/dashboard?view=community-requests");
                      }}
                    >
                      <Briefcase className="mr-2 h-4 w-4" />
                      Switch to Coaching
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onSelect={() => {
                      router.push("/dashboard?view=inbox");
                    }}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Inbox
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      router.push("/dashboard?view=settings");
                    }}
                  >
                    <User className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>

                  {!hasExpertProfile ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        router.push("/become-expert");
                      }}
                    >
                      <User className="mr-2 h-4 w-4" />
                      Become an Expert
                    </DropdownMenuItem>
                  ) : null}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      router.push("/requests");
                    }}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Community message board
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      void signOut();
                    }}
                  >
                    Sign out
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <SignInDialog
        open={signInOpen}
        onOpenChange={(o) => {
          setSignInOpen(o);
          if (!o) setSignInDescription(null);
        }}
        description={signInDescription}
        onRequestSignUp={() => setSignUpOpen(true)}
      />
      <SignUpDialog
        open={signUpOpen}
        onOpenChange={setSignUpOpen}
        onRequestSignIn={() => openSignIn(null)}
      />
      <AdvancedSearchDialog
        open={advancedSearchOpen}
        onOpenChange={setAdvancedSearchOpen}
        initialKeywords={searchQuery}
      />
      <BrowseCategoriesDialog open={browseCategoriesOpen} onOpenChange={setBrowseCategoriesOpen} />
      <PostRequestDialog open={postRequestOpen} onOpenChange={setPostRequestOpen} />

      <div className="border-t border-border px-4 py-2 md:hidden">
        <form onSubmit={onSearch} className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Find an Expert or Ask a Question"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border-border pl-10 pr-12"
          />
        </form>
      </div>
    </header>
  );
}
