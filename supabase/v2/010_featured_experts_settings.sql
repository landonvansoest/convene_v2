-- Featured / browse expert visibility rules (homepage grid, /experts, search uses GET /api/experts).
-- Single row; tune from /admin (Bearer secret or ADMIN_EMAIL).

CREATE TABLE public.featured_experts_settings (
  singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  include_temp boolean NOT NULL DEFAULT true,
  include_pending boolean NOT NULL DEFAULT false,
  min_complete_sessions integer CHECK (min_complete_sessions IS NULL OR min_complete_sessions >= 0),
  require_verified boolean NOT NULL DEFAULT false,
  min_avg_rating numeric(4, 2) CHECK (min_avg_rating IS NULL OR (min_avg_rating >= 1 AND min_avg_rating <= 5)),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.featured_experts_settings (singleton_id, include_temp, include_pending)
VALUES (1, true, false)
ON CONFLICT (singleton_id) DO NOTHING;

COMMENT ON TABLE public.featured_experts_settings IS 'Public expert list filters for featured grid and /api/experts; Bible-aligned admin-tunable rules.';
