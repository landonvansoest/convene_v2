-- 055_request_response_upvotes_trigger.sql
-- Keeps request_responses.upvote_count in sync with request_response_upvotes
-- (Bible: maintain aggregate via DB trigger on insert/delete).
-- Re-run safe / idempotent.

CREATE INDEX IF NOT EXISTS request_response_upvotes_user_idx
  ON public.request_response_upvotes (user_id);

CREATE OR REPLACE FUNCTION public.tg_request_response_upvotes_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.request_responses
       SET upvote_count = upvote_count + 1
     WHERE response_id = NEW.response_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.request_responses
       SET upvote_count = GREATEST(0, upvote_count - 1)
     WHERE response_id = OLD.response_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_request_response_upvotes_count ON public.request_response_upvotes;
CREATE TRIGGER tg_request_response_upvotes_count
AFTER INSERT OR DELETE ON public.request_response_upvotes
FOR EACH ROW EXECUTE FUNCTION public.tg_request_response_upvotes_count();

UPDATE public.request_responses rr
   SET upvote_count = sub.cnt
  FROM (
    SELECT response_id, count(*)::int AS cnt
      FROM public.request_response_upvotes
     GROUP BY response_id
  ) sub
 WHERE sub.response_id = rr.response_id
   AND rr.upvote_count <> sub.cnt;
