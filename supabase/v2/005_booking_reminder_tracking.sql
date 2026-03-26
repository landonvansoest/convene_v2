-- Idempotent 15-minute reminder cron (avoids duplicate emails/SMS on repeated runs)

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_15m_sent_at timestamptz;

COMMENT ON COLUMN public.bookings.reminder_15m_sent_at IS 'When the 15-minute pre-session reminder was dispatched; NULL means not yet sent.';
