-- Seed the Footer page into site_text_blocks so it shows up alongside
-- the About page under Website CMS → Website Text Update. The Footer
-- Settings sidebar entry is retired; admins edit these three columns
-- as plain text blocks now.
--
-- Idempotent: ON CONFLICT DO NOTHING preserves admin edits on re-run.

INSERT INTO public.site_text_blocks (page_slug, block_key, label, content, display_order)
VALUES
  (
    'footer',
    'column_1',
    'Column 1',
    E'Support\nAbout convene\nFAQs\nBecome an Expert\nContact Us',
    10
  ),
  (
    'footer',
    'column_2',
    'Column 2',
    E'Resources\nFor users\nFor experts\nLearn how to get the most of your convene sessions',
    20
  ),
  (
    'footer',
    'column_3',
    'Column 3',
    'Connect with us',
    30
  )
ON CONFLICT (page_slug, block_key) DO NOTHING;
