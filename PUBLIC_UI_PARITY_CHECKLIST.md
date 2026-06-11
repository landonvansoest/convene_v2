# v2 Public UI parity checklist (Bible → v1)

This checklist is the working contract for bringing **v2 public pages** into parity with **v1**, using the **Bible** as the tie‑breaker whenever v1 and the Bible differ.

## Pages in scope
- `/` (homepage)
- `/experts` (browse directory)
- `/experts/[id]` (public expert profile)
- `/search` (search results)

## Global / design system (shared)
- **Color + typography tokens**: use `bg-background`, `text-foreground`, `bg-card`, `border-border`, etc. Avoid hard-coded `bg-white`, `bg-gray-50`, raw hex colors in page/layout code unless explicitly part of the v1 palette.
- **No dark mode (for now)**: site stays light regardless of OS preference.
- **Containers + spacing**: public pages should consistently use the same max width and horizontal padding (v1-like).
- **Badges**
  - **Verified Expert**: shown only when Bible conditions are met (subscription eligibility or admin override), not just `is_verified`.
  - **Online Now**: badge on avatar (small green circle top-right) when `users.online = true`.
  - **Available Now**: only when expert is bookable within 1 hour.

## Homepage (`/`)
Bible anchor: “### Homepage (/)”
- **Category strip**: show the Bible list; hide categories that are “off” in admin (feature flag).
- **Hero layout**:
  - Headline: “Find an EXPERT. Book a SESSION. Chat LIVE.” with Learn More link.
  - Hero illustration sits **to the right** and **must not move below text**; on small screens, crop illustration if needed to preserve text size.
- **Featured experts grid**:
  - Only experts with visibility state `visible`.
  - Admin controls: ability to toggle entire grid on/off; rules for inclusion (LIVE/TEMP, has photo, verified, min sessions, min rating).
  - When relevant, show verification + available-now badges.
- **“Find an EXPERT…” hero-style section**: present (per Bible).
- **How Convene works**: 3-step row with icon color semantics (primary blue, hero orange, secondary teal).
- **Ready to Get Started row**: 3 buttons opening dialogs:
  - Find an expert → Advanced Search popup
  - Browse Categories → Categories popup
  - Post a Request → Post Request dialog

## Experts directory (`/experts`)
- **Copy/positioning**: directory should match v1/Bible language (avoid “Active experts only” if not Bible-backed).
- **Card grid parity**: uses the same card component + breakpoints as homepage/search.
- **Search input behavior**: v1-like (searching experts) and consistent placeholder/copy.

## Search results (`/search`)
Bible anchor: “### Search results (/search)” + “Search engine contract”
- **Header/search**: supports keyword and category flows from homepage/header.
- **Advanced search UI**: dropdown/popover with Bible fields + quick filters:
  - Category dropdown
  - Quick filters: Verified Experts, Online Now, Available Now
  - Reset Filters / Cancel / Search buttons
- **Results list layout**: per-expert rows with key columns (name/title/bio + view profile + next available blocks + Book a Session CTA).
- **Empty state**: show guidance text with links to Advanced Search, Post a Request, and Message Us.
- **Visibility hard rule**: never show hidden/pending experts regardless of filters.

## Expert profile (`/experts/[id]`)
Bible anchor: “### Expert profile”
- **Visibility handling**:
  - If hidden: do not show normal public profile content; show a reduced view and/or similar experts section as Bible specifies.
  - If visible: show normal public profile content.
- **Similar experts**: show a small list (e.g., 3), preferably same category and/or overlapping skills.
- **CTA placement**: “Book a session” and “Message” match v1 placement and styling.
- **Badges**: Verified/Online/Available-now rules as above.

## Primary files to change (mapping)
- Theme + base: `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/components/AppProviders.tsx`
- Header: `apps/web/src/components/SiteHeader.tsx`
- Homepage: `apps/web/src/components/home/HomeCategoryNav.tsx`, `apps/web/src/components/home/HomeHero.tsx`, `apps/web/src/components/home/FeaturedExperts.tsx`
- Cards: `apps/web/src/components/home/ExpertCoachCard.tsx`
- Browse: `apps/web/src/app/experts/ExpertsBrowseContent.tsx`
- Search: `apps/web/src/components/search/SearchResultsPageClient.tsx` (+ dialogs)
- Profile: `apps/web/src/app/experts/[id]/page.tsx`

