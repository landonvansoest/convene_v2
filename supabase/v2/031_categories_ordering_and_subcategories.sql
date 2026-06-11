-- Category admin grid enhancements:
--   * display_order  — stable numeric ordering used by the admin grid and
--                      eventually the public category nav. Lower number = higher
--                      in the list. New rows get placed at the end.
--   * subcategories  — free-form list of sub-tags shown underneath each row and
--                      available for downstream filtering.
--
-- Backfill assigns display_order by current alphabetical order so the grid
-- matches the pre-migration list on first load.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subcategories text[] NOT NULL DEFAULT '{}'::text[];

WITH ranked AS (
  SELECT category_id,
         row_number() OVER (ORDER BY name ASC) AS rn
  FROM public.categories
  WHERE display_order = 0
)
UPDATE public.categories c
SET display_order = ranked.rn
FROM ranked
WHERE ranked.category_id = c.category_id;

CREATE INDEX IF NOT EXISTS categories_display_order_idx
  ON public.categories (is_active DESC, display_order ASC, name ASC);

COMMENT ON COLUMN public.categories.display_order IS
  'Admin-tunable sort order for the category grid. Active rows sort before inactive rows, then by display_order ASC, name ASC.';
COMMENT ON COLUMN public.categories.subcategories IS
  'Free-form list of sub-tags for a category. Rendered under the category in the admin grid; may feed search/filter UI.';
