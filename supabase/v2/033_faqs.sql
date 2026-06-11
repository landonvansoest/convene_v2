-- Admin-editable FAQ entries for the public About page FAQs accordion (and any
-- future surfaces that want to show the same list). Each row is one Q&A pair.
--
-- Rows are ordered by display_order ASC; new admin-created entries land at the
-- end. Unpublished entries (is_published = false) are hidden from public pages
-- but still visible to admins.

CREATE TABLE IF NOT EXISTS public.faqs (
  faq_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faqs_published_order_idx
  ON public.faqs (is_published, display_order, created_at)
  WHERE is_published = true;

COMMENT ON TABLE public.faqs IS
  'Public site FAQs, authored via the Website CMS → FAQ Edit admin screen.';

-- Seed the 7 existing About-page FAQs on first run. Uses a guard that skips if
-- the table already has rows (so re-running does not create duplicates after
-- an admin has customized the list).
INSERT INTO public.faqs (question, answer, display_order)
SELECT * FROM (VALUES
  (
    'How much do sessions cost?',
    'Each expert sets their own rates based on their experience and expertise. Rates typically range from $25-$500 per hour. You''ll see the exact price for your selected session duration before confirming your booking. Many experts also offer package deals and first-session discounts.',
    10
  ),
  (
    'What if I need to reschedule or cancel?',
    'You can reschedule or cancel sessions from your dashboard. Cancellation policies vary by expert, but most offer free cancellation up to 24 hours before the session. Check the expert''s specific cancellation policy on their profile page.',
    20
  ),
  (
    'How do the video sessions work?',
    'Sessions are conducted through our integrated video platform. At your scheduled time, simply join from your dashboard — no downloads or special software required. You can use your camera, microphone, share your screen, and chat in real-time with your expert.',
    30
  ),
  (
    'How are experts verified?',
    'All experts on Convene go through a verification process where we review their credentials, experience, and professional background. Verified experts display a verification badge on their profile. We also monitor expert ratings and reviews to ensure quality standards are maintained.',
    40
  ),
  (
    'Can I message an expert before booking?',
    'This depends on the expert''s preferences. Some experts allow messaging before booking, while others prefer to only communicate with confirmed bookings. You''ll see the expert''s messaging preferences on their profile page.',
    50
  ),
  (
    'How do I become an expert on Convene?',
    'Click "Become an Expert" in the header to get started. You''ll complete a profile setup wizard where you add your credentials, set your availability, and configure your booking preferences. Once your profile is complete, you can start receiving booking requests from learners.',
    60
  ),
  (
    'What payment methods do you accept?',
    'We accept all major credit cards and debit cards through our secure payment processor Stripe. Payment is processed when you confirm your booking, and you''ll receive a receipt via email.',
    70
  )
) AS seed(question, answer, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.faqs);
