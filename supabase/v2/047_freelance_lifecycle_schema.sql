-- 047_freelance_lifecycle_schema.sql
-- PART 2 of 2 — schema, backfill, indexes, helper function.
--
-- Run AFTER `046_freelance_lifecycle.sql`. The 046 file adds the new
-- freelance_work_status enum values (`completion_submitted`, `admin_review`,
-- etc.) which the partial indexes below reference; Postgres requires those
-- values to be committed before they can appear in DDL predicates.
--
-- Changes:
--   1. Add referencing columns (supersedes_freelance_id, conversation_id,
--      originating_message_id) and bookkeeping fields (completion_message,
--      completion_attachments, refunded_amount_cents, decline_reason,
--      admin_review_reason, admin_review_at, payout_released_at,
--      stripe_payment_intent_id).
--   2. Backfill SLA columns and payout_released_at for rows that pre-date
--      the lifecycle work, so cron + admin queries see a consistent picture.
--   3. Add indexes the new cron + admin queue need.
--   4. Helper function: freelance_compute_sla(...).
--
-- Re-run safety: every step is idempotent.

-- ---------- 1. New columns ----------

ALTER TABLE public.freelance_work
  ADD COLUMN IF NOT EXISTS supersedes_freelance_id uuid
    REFERENCES public.freelance_work (freelance_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id uuid
    REFERENCES public.conversations (conversation_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS originating_message_id uuid
    REFERENCES public.messages (message_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_message text,
  ADD COLUMN IF NOT EXISTS completion_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS refunded_amount_cents bigint NOT NULL DEFAULT 0
    CHECK (refunded_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS admin_review_reason text,
  ADD COLUMN IF NOT EXISTS admin_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

COMMENT ON COLUMN public.freelance_work.supersedes_freelance_id IS
  'When a declined offer is re-sent as a new row, this links back to the previous row for history.';
COMMENT ON COLUMN public.freelance_work.conversation_id IS
  'Conversation where the offer was sent; allows linking back to the message thread per Bible §FKs.';
COMMENT ON COLUMN public.freelance_work.originating_message_id IS
  'Message that announced the offer in the conversation thread.';
COMMENT ON COLUMN public.freelance_work.completion_message IS
  'Optional handoff note the expert sends with the completion submission.';
COMMENT ON COLUMN public.freelance_work.completion_attachments IS
  'JSON array of {url,name,size_bytes,mime} for completion files. Empty array when none.';
COMMENT ON COLUMN public.freelance_work.payout_released_at IS
  'Set when the learner accepts completion OR the 3-day silence auto-release fires.';
COMMENT ON COLUMN public.freelance_work.stripe_payment_intent_id IS
  'Stripe PI id snapshot for cross-reference with the transactions ledger.';

-- ---------- 2. Data backfill ----------

-- Pre-lifecycle rows that look like they were never paid stay 'offered'.
-- Rows with paid status that previously had `approved` (now renamed to
-- `paid_in_progress`) keep that status. `completed` rows that lack
-- `payout_released_at` get backfilled to `updated_at` so the ledger stays
-- consistent with the new "release on completion" semantic.
UPDATE public.freelance_work
   SET payout_released_at = updated_at
 WHERE status = 'completed'
   AND payout_released_at IS NULL;

-- `deadline` is timestamptz in the v2 schema (002_core_schema.sql), so we
-- copy it straight across when work_deadline isn't set. Rows with no
-- deadline at all are left untouched; the cron will skip them (it only
-- auto-escalates rows with a concrete expert_grace_end_at).
UPDATE public.freelance_work
   SET work_deadline = deadline
 WHERE work_deadline IS NULL
   AND deadline IS NOT NULL;

-- Pre-compute expert_grace_end_at (work_deadline + 3 days) for any row
-- that has a deadline but no grace stamp yet, so the missed-deadline cron
-- can find them on its first pass.
UPDATE public.freelance_work
   SET expert_grace_end_at = work_deadline + interval '3 days'
 WHERE expert_grace_end_at IS NULL
   AND work_deadline IS NOT NULL;

-- Same idea for completion rows: if a row is sitting in completion_submitted
-- (post-migration) without a learner deadline yet, derive it now.
UPDATE public.freelance_work
   SET learner_completion_deadline_at = completion_submitted_at + interval '3 days'
 WHERE learner_completion_deadline_at IS NULL
   AND completion_submitted_at IS NOT NULL;

-- ---------- 3. Indexes for cron + admin queries ----------

-- Cron sweep: finds completion_submitted rows whose 3-day window has elapsed.
CREATE INDEX IF NOT EXISTS freelance_work_auto_release_idx
  ON public.freelance_work (status, learner_completion_deadline_at)
  WHERE status = 'completion_submitted';

-- Cron sweep: finds paid_in_progress rows whose work_deadline + grace has passed.
CREATE INDEX IF NOT EXISTS freelance_work_grace_idx
  ON public.freelance_work (status, expert_grace_end_at)
  WHERE status = 'paid_in_progress';

-- Admin queue: pending admin_review rows ordered by oldest first.
CREATE INDEX IF NOT EXISTS freelance_work_admin_review_idx
  ON public.freelance_work (admin_review_at)
  WHERE status = 'admin_review';

-- Inbox/list queries by participant.
CREATE INDEX IF NOT EXISTS freelance_work_expert_idx
  ON public.freelance_work (expert_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS freelance_work_learner_idx
  ON public.freelance_work (learner_user_id, updated_at DESC);

-- ---------- 4. Helper function: SLA deadlines ----------
--
-- Computes the canonical SLA timestamps the cron + admin queries rely on.
-- Centralized here so the JS layer doesn't have to re-derive them.
--
-- 3 calendar days (per Bible) is treated as 72 hours from the relevant
-- anchor (paid_in_progress_at, work_deadline, completion_submitted_at,
-- admin_review_at). "Calendar day" is approximated as 24h * 3 = 72h to
-- keep the math timezone-agnostic; product can tighten later if needed.

CREATE OR REPLACE FUNCTION public.freelance_compute_sla(
  p_status freelance_work_status,
  p_work_deadline timestamptz,
  p_completion_submitted_at timestamptz,
  p_admin_review_at timestamptz
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'expert_grace_end_at',
      CASE WHEN p_work_deadline IS NULL THEN NULL
           ELSE p_work_deadline + interval '3 days' END,
    'learner_completion_deadline_at',
      CASE WHEN p_completion_submitted_at IS NULL THEN NULL
           ELSE p_completion_submitted_at + interval '3 days' END,
    'rectification_deadline_at',
      CASE WHEN p_admin_review_at IS NULL THEN NULL
           ELSE p_admin_review_at + interval '3 days' END
  );
$$;

COMMENT ON FUNCTION public.freelance_compute_sla(freelance_work_status, timestamptz, timestamptz, timestamptz) IS
  'Canonical SLA deadline math for freelance_work. Returns a JSON object the API and cron use to keep deadline columns in lockstep.';
