-- 046_freelance_lifecycle.sql
-- PART 1 of 2 — enum changes only.
--
-- This file ONLY mutates the `freelance_work_status` enum. The schema /
-- index / backfill / helper work lives in `047_freelance_lifecycle_schema.sql`
-- and MUST be run as a separate statement AFTER this one. Postgres requires
-- newly-added enum values to be committed before they can appear in DDL
-- predicates such as partial-index `WHERE` clauses, and Supabase's SQL
-- editor wraps every run in a single transaction — so any attempt to add a
-- value and use it in the same script fails with
--   ERROR 55P04: unsafe use of new value "..." of enum type ...
--
-- Order of operations:
--   1. Run THIS file (`046_freelance_lifecycle.sql`).
--   2. Run `047_freelance_lifecycle_schema.sql`.
--
-- Both files are idempotent (every step uses IF NOT EXISTS / EXCEPTION
-- WHEN duplicate_object) so re-running either is safe.
--
-- Changes here:
--   • Rename `approved`  → `paid_in_progress`   (data identity preserved)
--   • Rename `complete`  → `completed`           (data identity preserved)
--   • Add the five new Bible-specified values:
--       declined, accepted_pending_payment, completion_submitted,
--       refunded, admin_review

DO $$ BEGIN
  ALTER TYPE freelance_work_status RENAME VALUE 'approved' TO 'paid_in_progress';
EXCEPTION
  -- value already renamed, or 'approved' no longer exists
  WHEN invalid_parameter_value THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE freelance_work_status RENAME VALUE 'complete' TO 'completed';
EXCEPTION
  WHEN invalid_parameter_value THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN ALTER TYPE freelance_work_status ADD VALUE IF NOT EXISTS 'declined'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE freelance_work_status ADD VALUE IF NOT EXISTS 'accepted_pending_payment'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE freelance_work_status ADD VALUE IF NOT EXISTS 'completion_submitted'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE freelance_work_status ADD VALUE IF NOT EXISTS 'refunded'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE freelance_work_status ADD VALUE IF NOT EXISTS 'admin_review'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
