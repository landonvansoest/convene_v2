-- Website Text Update CMS: admin-editable text blocks keyed per page.
--
-- Each row represents one editable "block" on a public-facing page (e.g. the
-- "Heading" block on /about). The admin UI groups blocks by page_slug, shows
-- their `label`, and lets an admin edit `content`. The public page can later
-- read a specific block via (page_slug, block_key) when it is wired up.

CREATE TABLE IF NOT EXISTS public.site_text_blocks (
  block_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug text NOT NULL,
  block_key text NOT NULL,
  label text NOT NULL,
  content text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_slug, block_key)
);

CREATE INDEX IF NOT EXISTS site_text_blocks_page_order_idx
  ON public.site_text_blocks (page_slug, display_order, label);

COMMENT ON TABLE public.site_text_blocks IS
  'Admin-editable text blocks driving the Website Text Update CMS. Grouped by page_slug; each (page_slug, block_key) is unique.';
COMMENT ON COLUMN public.site_text_blocks.page_slug IS
  'Page identifier used in admin UI grouping. Examples: "about", "home", "experts".';
COMMENT ON COLUMN public.site_text_blocks.block_key IS
  'Stable machine key used by the public page to look up this block. Examples: "heading", "how_it_works", "resources".';
COMMENT ON COLUMN public.site_text_blocks.label IS
  'Human-readable label shown in the admin CMS list (e.g., "Heading", "How It Works").';

-- Seed About page blocks with the current copy shown on /about.
INSERT INTO public.site_text_blocks (page_slug, block_key, label, content, display_order)
VALUES
  (
    'about',
    'heading',
    'Heading',
    'Find an EXPERT. Book a SESSION. Chat LIVE.

Stuck on a project? Looking to sharpen your skills? Tired of waiting for tech support?

Welcome to Convene. We have a broad range of experts ready to coach you in a face-to-face video call. Just ask a question in the search box to find relevant experts, select your coach, and book time to talk.

Still have questions? Check out our FAQs below or contact us, we''d love to hear from you.',
    10
  ),
  (
    'about',
    'how_it_works',
    'How It Works',
    'How It Works

Getting started with convene is simple. Join our community and follow these steps to start consulting with a live, human expert today.

Find an Expert
Search by skill or simply ask a question. Alternatively, you can post a question to the marketplace and have Experts come to you.

Book a Session
Choose a time that works for you from the expert''s calendar. Sessions are flexible and can be customized to your needs.

Chat Live
Connect via video call at your scheduled time. Get personalized guidance, ask questions, and learn directly from an expert.',
    20
  ),
  (
    'about',
    'resources',
    'Resources',
    'Resources

For users
Learn how to prepare before each session, ask focused questions, and follow up effectively so every minute with your expert turns into practical progress.

For experts
Discover ways to structure sessions, set clear outcomes, and create a consistent consulting experience that helps learners succeed and keeps your profile in high demand.',
    30
  )
ON CONFLICT (page_slug, block_key) DO NOTHING;
