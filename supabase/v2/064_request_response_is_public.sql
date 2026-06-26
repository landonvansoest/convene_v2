-- 064_request_response_is_public.sql
-- Experts can post public responses (message board) or private (request owner only).

ALTER TABLE public.request_responses
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.request_responses.is_public IS
  'When false, visible only to the request owner and the responding expert.';
