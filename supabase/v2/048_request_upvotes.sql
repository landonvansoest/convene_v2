-- 048_request_upvotes.sql
-- Adds an upvote system for community requests, mirroring the existing
-- `request_response_upvotes` pattern used for responses.
--
-- Changes:
--   1. `requests.upvote_count` integer (denormalized counter for fast list reads).
--   2. `request_upvotes` join table (request_id, user_id) — one upvote per
--      user per request. Drop the row to remove the upvote.
--   3. Trigger `tg_request_upvotes_count` keeps `requests.upvote_count` in
--      lockstep with the join table on INSERT/DELETE.
--
-- Re-run safety: every statement is idempotent.

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS upvote_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.request_upvotes (
  request_id uuid NOT NULL REFERENCES public.requests (request_id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users (user_id)       ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);

CREATE INDEX IF NOT EXISTS request_upvotes_user_idx
  ON public.request_upvotes (user_id);

-- Counter maintenance. Keep `requests.upvote_count` synced so list queries
-- don't have to JOIN. We deliberately bound the count at >= 0 in case the
-- denormalized counter drifts (shouldn't happen, but defensive).
CREATE OR REPLACE FUNCTION public.tg_request_upvotes_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.requests
       SET upvote_count = upvote_count + 1,
           updated_at   = now()
     WHERE request_id = NEW.request_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.requests
       SET upvote_count = GREATEST(0, upvote_count - 1),
           updated_at   = now()
     WHERE request_id = OLD.request_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_request_upvotes_count ON public.request_upvotes;
CREATE TRIGGER tg_request_upvotes_count
AFTER INSERT OR DELETE ON public.request_upvotes
FOR EACH ROW EXECUTE FUNCTION public.tg_request_upvotes_count();

-- One-time backfill in case any rows were already manually inserted into
-- request_upvotes (e.g. seed data) before the trigger existed.
UPDATE public.requests r
   SET upvote_count = sub.cnt
  FROM (
    SELECT request_id, count(*)::int AS cnt
      FROM public.request_upvotes
     GROUP BY request_id
  ) sub
 WHERE sub.request_id = r.request_id
   AND r.upvote_count <> sub.cnt;
