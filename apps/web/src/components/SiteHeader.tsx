"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Briefcase,
  Calendar,
  ChevronDown,
  GraduationCap,
  LayoutGrid,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Search,
  Settings,
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
import { OnlineDot } from "@/components/presence/OnlineDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { SignInDialog } from "@/components/auth/SignInDialog";
import { SignUpDialog } from "@/components/auth/SignUpDialog";
import { AdvancedSearchDialog } from "@/components/search/AdvancedSearchDialog";
import { BrowseCategoriesDialog } from "@/components/search/BrowseCategoriesDialog";
import { PostRequestDialog } from "@/components/requests/PostRequestDialog";
import {
  HEADER_BADGES_MAY_HAVE_CHANGED,
  INBOX_UNREAD_MAY_HAVE_CHANGED,
} from "@/lib/messages/inbox-unread-events";
import { bookingPaymentIsSettled, hasSessionEndedByWallClock } from "@/lib/sessionWallClock";

function avatarInitialsFromProfile(p: Record<string, unknown> | null): string {
  if (!p) return "U";
  const first = typeof p.first_name === "string" ? p.first_name.trim() : "";
  const last = typeof p.last_name === "string" ? p.last_name.trim() : "";
  const a = first.slice(0, 1);
  const b = last.slice(0, 1);
  if (a || b) return `${a}${b}`.toUpperCase();
  const full = typeof p.full_name === "string" ? p.full_name.trim() : "";
  if (full) {
    const parts = full.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
    }
    return full.slice(0, 2).toUpperCase();
  }
  const email =
    typeof p.email_address === "string" && p.email_address.trim() ? p.email_address.trim() : "";
  return email.slice(0, 1).toUpperCase() || "U";
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchMenu, setShowSearchMenu] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [avatarInitials, setAvatarInitials] = useState("U");
  const [hasExpertProfile, setHasExpertProfile] = useState<boolean>(false);
  const [displayName, setDisplayName] = useState<string>("");
  const [emailAddress, setEmailAddress] = useState<string>("");
  const [roleMode, setRoleMode] = useState<"learner" | "expert">("learner");
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
  const [signInPostRedirect, setSignInPostRedirect] = useState<string | null>(null);
  /** False while session is resolving; false then true after `/api/me` when signed in. */
  const [meLoaded, setMeLoaded] = useState(false);
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [browseCategoriesOpen, setBrowseCategoriesOpen] = useState(false);
  const [postRequestOpen, setPostRequestOpen] = useState(false);

  async function persistRoleMode(nextMode: "learner" | "expert"): Promise<boolean> {
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ convene_role_mode: nextMode }),
    });
    return res.ok;
  }

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

  /** Keep the search input in sync after a full navigation to `/search?q=...`. */
  useEffect(() => {
    if (pathname !== "/search" || typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("q");
    setSearchQuery(q ?? "");
  }, [pathname]);

  useEffect(() => {
    if (signedIn === false) {
      setProfilePhoto(null);
      setAvatarInitials("U");
      setHasExpertProfile(false);
      setDisplayName("");
      setEmailAddress("");
      setRoleMode("learner");
      setNextSessionCountdown(null);
      setBookedSessionsCount(0);
      setInboxUnreadCount(0);
      setMeLoaded(true);
      return;
    }
    if (!signedIn) {
      setMeLoaded(false);
      return;
    }
    setMeLoaded(false);
    void fetch("/api/me")
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as { profile?: Record<string, unknown> | null } | null;
      })
      .then((data) => {
        const p = (data?.profile ?? null) as Record<string, unknown> | null;
        const photo = p?.profile_photo;
        setProfilePhoto(typeof photo === "string" && photo.trim() ? photo : null);
        setAvatarInitials(avatarInitialsFromProfile(p));
        setHasExpertProfile(Boolean(p?.has_expert_profile));
        const full = typeof p?.full_name === "string" ? p.full_name.trim() : "";
        const first = typeof p?.first_name === "string" ? p.first_name.trim() : "";
        const last = typeof p?.last_name === "string" ? p.last_name.trim() : "";
        const fallbackName = [first, last].filter(Boolean).join(" ").trim();
        setDisplayName(full || fallbackName || "User");
        const email =
          typeof p?.email_address === "string" && p.email_address.trim()
            ? p.email_address.trim()
            : "";
        setEmailAddress(email);
        const dbMode = p?.convene_role_mode;
        if (dbMode === "expert" || dbMode === "learner") {
          setRoleMode(dbMode);
        } else {
          setRoleMode(Boolean(p?.has_expert_profile) ? "expert" : "learner");
        }
      })
      .catch(() => {
        setProfilePhoto(null);
        setAvatarInitials("U");
        setHasExpertProfile(false);
        setDisplayName("");
        setEmailAddress("");
        setRoleMode("learner");
      })
      .finally(() => setMeLoaded(true));
  }, [signedIn]);

  const badgeFetchGen = useRef(0);

  const refreshHeaderBadges = useCallback(async () => {
    if (!signedIn) return;
    const gen = ++badgeFetchGen.current;

    const [unreadRes, sessionsRes, summaryRes] = await Promise.allSettled([
      fetch("/api/messages/unread/count", { cache: "no-store" }),
      fetch("/api/sessions?type=upcoming", { cache: "no-store" }),
      fetch("/api/me/dashboard-summary", { cache: "no-store" }),
    ]);

    if (gen !== badgeFetchGen.current) return;

    if (unreadRes.status === "fulfilled" && unreadRes.value.ok) {
      try {
        const data = (await unreadRes.value.json()) as { count?: number };
        setInboxUnreadCount(typeof data?.count === "number" ? data.count : 0);
      } catch {
        setInboxUnreadCount(0);
      }
    }

    let bookedFromSummary = false;
    if (summaryRes.status === "fulfilled" && summaryRes.value.ok) {
      try {
        const data = (await summaryRes.value.json()) as {
          counts?: {
            expertNewBookings?: number;
            learnerUnpaidCardBookings?: number;
          };
        };
        const ex = typeof data.counts?.expertNewBookings === "number" ? data.counts.expertNewBookings : 0;
        const lr =
          typeof data.counts?.learnerUnpaidCardBookings === "number"
            ? data.counts.learnerUnpaidCardBookings
            : 0;
        setBookedSessionsCount(Math.max(0, ex + lr));
        bookedFromSummary = true;
      } catch {
        /* fall through */
      }
    }

    if (sessionsRes.status === "fulfilled" && sessionsRes.value.ok) {
      try {
        const data = (await sessionsRes.value.json()) as { sessions?: Array<Record<string, unknown>> };
        const sessions = Array.isArray(data?.sessions) ? data.sessions : [];

        if (!bookedFromSummary) {
          let fallbackBooked = 0;
          for (const s of sessions) {
            const status = s.status as string | undefined;
            const paymentStatus = s.payment_status as string | undefined;
            const userRole = s.user_role as string | undefined;
            const sessionDate = s.session_date as string | undefined;
            const endTime = s.end_time as string | undefined;
            if (
              userRole === "expert" &&
              status === "upcoming" &&
              !bookingPaymentIsSettled(paymentStatus) &&
              String(paymentStatus ?? "").toLowerCase() !== "refunded" &&
              !hasSessionEndedByWallClock(sessionDate, endTime)
            ) {
              fallbackBooked += 1;
            }
          }
          setBookedSessionsCount(fallbackBooked);
        }

        const nowMs = Date.now();
        let bestNext: { hours: number; minutes: number; totalMinutes: number } | null = null;

        for (const s of sessions) {
          const status = s.status as string | undefined;
          const paymentStatus = s.payment_status as string | undefined;
          const psLower = String(paymentStatus ?? "").toLowerCase();
          if (status !== "upcoming" || (psLower !== "paid" && psLower !== "succeeded")) continue;

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

        setNextSessionCountdown(bestNext);
      } catch {
        if (!bookedFromSummary) setBookedSessionsCount(0);
        setNextSessionCountdown(null);
      }
    } else {
      if (!bookedFromSummary) setBookedSessionsCount(0);
      setNextSessionCountdown(null);
    }
  }, [signedIn]);

  /** Initial + when role/navigation changes; polling/events handle background updates. */
  useEffect(() => {
    if (!signedIn) return;
    void refreshHeaderBadges();
  }, [signedIn, pathname, refreshHeaderBadges]);

  /**
   * Same `INBOX_UNREAD_MAY_HAVE_CHANGED` as dashboard sidebar; also session badges + tab refocus + poll.
   */
  useEffect(() => {
    if (!signedIn) return;
    const run = () => void refreshHeaderBadges();
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener(INBOX_UNREAD_MAY_HAVE_CHANGED, run);
    window.addEventListener(HEADER_BADGES_MAY_HAVE_CHANGED, run);
    document.addEventListener("visibilitychange", onVis);
    const intervalMs = 60_000;
    const id = window.setInterval(run, intervalMs);
    return () => {
      window.removeEventListener(INBOX_UNREAD_MAY_HAVE_CHANGED, run);
      window.removeEventListener(HEADER_BADGES_MAY_HAVE_CHANGED, run);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [signedIn, refreshHeaderBadges]);

  if (pathname === "/login") return null;

  async function signOut() {
    let sb: ReturnType<typeof createBrowserSupabase> | null = null;
    try {
      sb = createBrowserSupabase();
    } catch {
      sb = null;
    }

    try {
      await fetch("/api/me/offline", {
        method: "POST",
        credentials: "include",
        keepalive: true,
      });
    } catch {
      // Best-effort: the sweep cron will reconcile within a couple minutes.
    }

    if (sb) {
      await sb.auth.signOut();
    }
    window.location.href = "/";
  }

  function openSignIn(description: string | null = null, postRedirect: string | null = null) {
    setSignInDescription(description);
    setSignInPostRedirect(postRedirect);
    setSignUpOpen(false);
    setSignInOpen(true);
  }

  function openSignUp() {
    setSignInOpen(false);
    setSignInDescription(null);
    setSignInPostRedirect(null);
    setSignUpOpen(true);
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

  /** Bible: show when not signed in, or signed in without an expert profile (after profile load). */
  const showBecomeExpertBadge =
    signedIn === false || (signedIn === true && meLoaded && !hasExpertProfile);

  function onBecomeExpertBadgeClick() {
    if (signedIn !== true) {
      openSignIn(
        "You must sign in or register to become an expert",
        "/become-expert"
      );
      return;
    }
    router.push("/become-expert");
  }

  /**
   * Use client navigation so Next App Router keeps the loaded CSS/JS shell. A raw GET form submit
   * triggers a full document load, which in dev (and some proxies) can flash or omit `_next` assets.
   */
  function onHeaderSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = searchQuery.trim();
    if (raw) router.push(`/search?q=${encodeURIComponent(raw)}`);
    else router.push("/search");
  }

  const isExpertMenu = signedIn && hasExpertProfile && roleMode === "expert";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-primary">convene</span>
          </Link>
        </div>

        {/* Desktop search bar (v1/Bible): input + hamburger dropdown */}
        <form
          data-tour-target="header-search"
          action="/search"
          method="get"
          onSubmit={onHeaderSearchSubmit}
          className="hidden max-w-2xl flex-1 px-4 md:flex"
        >
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="q"
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
                  className="rounded-md bg-convene-primary px-2.5 py-1 text-center text-white leading-none font-medium cursor-pointer hover:opacity-90"
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
                  className="rounded-md bg-convene-primary px-2 py-0.5 text-center text-white leading-none font-medium cursor-pointer hover:opacity-90"
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

          {showBecomeExpertBadge ? (
            <button
              type="button"
              onClick={() => onBecomeExpertBadgeClick()}
              className="shrink-0 whitespace-nowrap rounded-md px-1 text-sm font-medium text-foreground/90 hover:text-foreground hover:underline focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Become an Expert
            </button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="relative h-10 rounded-full px-2 hover:bg-transparent"
              >
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Avatar className="h-9 w-9 border-2 border-primary/20">
                      <AvatarImage
                        src={profilePhoto ?? undefined}
                        alt={signedIn && displayName ? displayName : "Account"}
                      />
                      <AvatarFallback
                        className={
                          signedIn
                            ? "bg-[#FFF6EE] text-xs font-semibold text-[#003049]"
                            : "bg-convene-hero text-white"
                        }
                      >
                        {signedIn ? avatarInitials : <User className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                    <OnlineDot online={signedIn === true} />
                  </div>
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
                      openSignUp();
                    }}
                  >
                    <User className="mr-2 h-4 w-4" />
                    Sign up
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      router.push("/about");
                    }}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Learn More
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      router.push("/requests");
                    }}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Community
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium text-foreground">{displayName || "User"}</p>
                    <p className="text-xs text-muted-foreground">{emailAddress || "—"}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      router.push("/dashboard?view=sessions");
                    }}
                  >
                    <LayoutGrid className="mr-2 h-4 w-4" />
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      router.push("/dashboard?view=inbox");
                    }}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Inbox
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      router.push("/dashboard?view=settings");
                    }}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Profile Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      router.push("/requests");
                    }}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Community
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {isExpertMenu ? (
                    <DropdownMenuItem
                      onSelect={async () => {
                        const ok = await persistRoleMode("learner");
                        if (ok) setRoleMode("learner");
                        router.push("/dashboard?view=overview");
                      }}
                    >
                      <GraduationCap className="mr-2 h-4 w-4" />
                      Switch to Learning
                    </DropdownMenuItem>
                  ) : hasExpertProfile ? (
                    <DropdownMenuItem
                      onSelect={async () => {
                        const ok = await persistRoleMode("expert");
                        if (ok) setRoleMode("expert");
                        router.push("/dashboard?view=community-requests");
                      }}
                    >
                      <Briefcase className="mr-2 h-4 w-4" />
                      Switch to Coaching
                    </DropdownMenuItem>
                  ) : (
                  <DropdownMenuItem
                    onSelect={() => {
                      onBecomeExpertBadgeClick();
                    }}
                  >
                    <Briefcase className="mr-2 h-4 w-4" />
                    Become an Expert
                  </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => {
                      void signOut();
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
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
          if (!o) {
            setSignInDescription(null);
            setSignInPostRedirect(null);
          }
        }}
        description={signInDescription}
        postSignInRedirect={signInPostRedirect}
        onRequestSignUp={openSignUp}
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
        <form
          data-tour-target="header-search"
          action="/search"
          method="get"
          onSubmit={onHeaderSearchSubmit}
          className="relative w-full"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            placeholder="Find an Expert or Ask a Question"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border-border pl-10 pr-12"
            aria-label="Search experts"
          />
        </form>
      </div>
    </header>
  );
}
