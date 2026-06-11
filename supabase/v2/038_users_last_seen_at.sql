-- 038_users_last_seen_at.sql
-- Adds last_seen_at timestamp so the Online Now badge can enforce the Bible's
-- "true when last action/heartbeat within 5 minutes" rule. The boolean
-- public.users.online stays as a fast read flag, but it is now derived from
-- last_seen_at via the heartbeat write path and a sweep cron that flips stale
-- rows back to false.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS users_last_seen_at_idx
  ON public.users (last_seen_at);
