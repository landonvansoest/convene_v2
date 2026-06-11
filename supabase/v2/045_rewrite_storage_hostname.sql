-- 045_rewrite_storage_hostname.sql
-- Sweep every text/jsonb column in the `public` schema and rewrite a stale
-- Supabase project hostname to a new one. Useful when the Supabase project
-- ref changes (e.g. after deleting the old free-tier project) and you have
-- seed data with hard-coded storage URLs (profile_photo, category icons,
-- message metadata, etc.) pointing at the dead host.
--
-- WARNING: This is a pure text substring rewrite. It will rewrite the host
-- anywhere it appears — including inside free-form prose stored in any text
-- column. For demo / dev data this is what you want; for production data you
-- almost always do, too (a dead host is never useful), but think before
-- running.
--
-- Re-run safely: idempotent — if no rows match, nothing changes.

CREATE OR REPLACE FUNCTION public.rewrite_storage_hostname(
  p_old_host text,
  p_new_host text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r              RECORD;
  v_pattern      text;
  v_row_count    int;
  v_total        int := 0;
  v_results      jsonb := '[]'::jsonb;
BEGIN
  IF p_old_host IS NULL OR p_new_host IS NULL THEN
    RAISE EXCEPTION 'old_host and new_host must both be provided';
  END IF;
  IF p_old_host = p_new_host THEN
    RAISE EXCEPTION 'old_host and new_host are the same — nothing to rewrite';
  END IF;
  IF length(p_old_host) < 4 THEN
    RAISE EXCEPTION 'old_host (%) looks too short — refusing to do a broad text sweep on it', p_old_host;
  END IF;

  v_pattern := '%' || p_old_host || '%';

  -- Walk every non-generated text-shaped column in public. We filter by
  -- table_type='BASE TABLE' to skip views; is_generated='NEVER' to skip
  -- generated columns (e.g. users.full_name) which can't be assigned to.
  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name   = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type   = 'BASE TABLE'
      AND c.is_generated = 'NEVER'
      AND c.data_type IN ('text', 'character varying', 'character', 'jsonb', 'json')
  LOOP
    v_row_count := 0;

    IF r.data_type IN ('text', 'character varying', 'character') THEN
      EXECUTE format(
        'UPDATE %I.%I SET %I = replace(%I, %L, %L) WHERE %I LIKE %L',
        r.table_schema, r.table_name, r.column_name,
        r.column_name, p_old_host, p_new_host,
        r.column_name, v_pattern
      );
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
    ELSE
      -- jsonb / json: cast to text, rewrite, cast back. Wrapping the entire
      -- value as text catches references in keys, values, nested arrays —
      -- anywhere the hostname might appear.
      EXECUTE format(
        'UPDATE %I.%I SET %I = replace(%I::text, %L, %L)::%s WHERE %I::text LIKE %L',
        r.table_schema, r.table_name, r.column_name,
        r.column_name, p_old_host, p_new_host, r.data_type,
        r.column_name, v_pattern
      );
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
    END IF;

    IF v_row_count > 0 THEN
      v_total   := v_total + v_row_count;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'column', format('%s.%s.%s', r.table_schema, r.table_name, r.column_name),
        'rows',   v_row_count
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'old_host', p_old_host,
    'new_host', p_new_host,
    'rows_rewritten', v_total,
    'changes', v_results
  );
END;
$$;

COMMENT ON FUNCTION public.rewrite_storage_hostname(text, text) IS
  'Rewrites every occurrence of one Supabase project hostname to another across all text/jsonb columns in the public schema. Returns a JSON report of rows changed per column.';

GRANT EXECUTE ON FUNCTION public.rewrite_storage_hostname(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- One-shot rewrite for the v2 cutover:
--   old project (deleted) — nbranvwdrgrefexzbskz.supabase.co
--   new project (active)  — jvklwgpkvtscqoimmfix.supabase.co
--
-- After this runs the result is logged via RAISE NOTICE so you can see at
-- a glance which columns were touched and how many rows each.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.rewrite_storage_hostname(
    'nbranvwdrgrefexzbskz.supabase.co',
    'jvklwgpkvtscqoimmfix.supabase.co'
  );
  RAISE NOTICE 'rewrite_storage_hostname result: %', v_result::text;
END $$;
