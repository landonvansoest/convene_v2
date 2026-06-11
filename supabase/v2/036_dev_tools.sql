-- Single source of truth for runtime-toggleable development utilities
-- ("DEV Tools" section in the admin UI). The canonical list of keys is
-- maintained in apps/web/src/lib/devTools/registry.ts; this table only
-- stores the enabled boolean per key so admins can flip behavior without
-- a deploy.
--
-- Adding a new DEV tool = add an entry to the TS registry + insert a row
-- here via a follow-up migration (or rely on the server to lazily insert
-- the default on first read).

CREATE TABLE IF NOT EXISTS public.dev_tools (
  tool_key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dev_tools IS
  'Runtime enable/disable flags for DEV Tools admin surface. Key joined with registry in app code.';

-- Seed the two currently-existing DEV tools.
-- Defaults mirror historical behavior:
--   * payment_bypass_session: OFF (previously required explicit opt-in via
--     site_settings.data.allow_payment_bypass_dev).
--   * email_verification_bypass: ON (the DEV signup button rendered whenever
--     NODE_ENV === 'development'; admins can now turn it off without a redeploy).
INSERT INTO public.dev_tools (tool_key, enabled)
VALUES
  ('payment_bypass_session', false),
  ('email_verification_bypass', true)
ON CONFLICT (tool_key) DO NOTHING;
