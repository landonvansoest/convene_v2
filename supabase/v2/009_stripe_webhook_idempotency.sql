-- Dedupe Stripe webhook deliveries (Stripe retries; handlers are mostly idempotent but this cuts load and edge cases)

CREATE TABLE IF NOT EXISTS public.processed_stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processed_stripe_webhook_events_received_idx
  ON public.processed_stripe_webhook_events (received_at);

COMMENT ON TABLE public.processed_stripe_webhook_events IS 'Log Stripe event ids after successful handling; early exit on duplicate. Service role only in app.';
