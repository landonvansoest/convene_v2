-- 043_booking_dependability_ratings.sql
-- Persist per-booking dependability scores and roll them up into user-level
-- averages per Bible §"Dependability Rating".
--
-- The per-booking score (bookings.learner_dependability / expert_dependability)
-- is written by the app layer (lib/dependability-persist.ts) which mirrors the
-- Bible's deduction rules. THIS migration owns:
--
--   1. recompute_user_dependability_ratings(user_id) — rebuilds both averages
--      for one user from their booking history.
--   2. A trigger that calls (1) automatically whenever a booking's per-side
--      score is inserted/updated, for both the learner and expert involved.
--   3. A one-time backfill so existing users with prior scores in the bookings
--      table (if any) get accurate averages immediately.
--
-- Final ratings live on:
--   users.learner_dependability_rating          (integer)
--   expert_profiles.expert_dependability_rating (integer)
--
-- Both are rounded averages of the non-null per-booking scores. NULL when the
-- user has no scored bookings yet.

CREATE OR REPLACE FUNCTION public.recompute_user_dependability_ratings(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_learner_avg numeric;
  v_expert_avg  numeric;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT avg(b.learner_dependability)::numeric
    INTO v_learner_avg
    FROM public.bookings b
   WHERE b.learner_user_id = p_user_id
     AND b.learner_dependability IS NOT NULL;

  SELECT avg(b.expert_dependability)::numeric
    INTO v_expert_avg
    FROM public.bookings b
   WHERE b.expert_user_id = p_user_id
     AND b.expert_dependability IS NOT NULL;

  UPDATE public.users
     SET learner_dependability_rating =
           CASE WHEN v_learner_avg IS NULL THEN NULL ELSE round(v_learner_avg)::int END
   WHERE user_id = p_user_id;

  UPDATE public.expert_profiles
     SET expert_dependability_rating =
           CASE WHEN v_expert_avg IS NULL THEN NULL ELSE round(v_expert_avg)::int END
   WHERE user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.recompute_user_dependability_ratings(uuid) IS
  'Recomputes users.learner_dependability_rating and expert_profiles.expert_dependability_rating from per-booking scores. Called by the bookings-side trigger and may be invoked manually for backfill.';

-- ---- Trigger: any change to per-booking scores → refresh user averages -------

CREATE OR REPLACE FUNCTION public.tg_bookings_recompute_dependability_ratings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_learner_changed boolean := false;
  v_expert_changed  boolean := false;
  v_old_learner     uuid;
  v_old_expert      uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_learner_changed := NEW.learner_dependability IS NOT NULL;
    v_expert_changed  := NEW.expert_dependability  IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_learner_changed := NEW.learner_dependability IS DISTINCT FROM OLD.learner_dependability;
    v_expert_changed  := NEW.expert_dependability  IS DISTINCT FROM OLD.expert_dependability;
    -- Defensive: if booking participants ever moved (unusual; FK forbids it),
    -- recompute for the old user too so their stale rating clears.
    IF NEW.learner_user_id IS DISTINCT FROM OLD.learner_user_id THEN
      v_old_learner := OLD.learner_user_id;
      v_learner_changed := true;
    END IF;
    IF NEW.expert_user_id IS DISTINCT FROM OLD.expert_user_id THEN
      v_old_expert := OLD.expert_user_id;
      v_expert_changed := true;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    -- Recompute for both old participants since their booking history shrank.
    PERFORM public.recompute_user_dependability_ratings(OLD.learner_user_id);
    PERFORM public.recompute_user_dependability_ratings(OLD.expert_user_id);
    RETURN OLD;
  END IF;

  IF v_learner_changed THEN
    PERFORM public.recompute_user_dependability_ratings(NEW.learner_user_id);
    IF v_old_learner IS NOT NULL THEN
      PERFORM public.recompute_user_dependability_ratings(v_old_learner);
    END IF;
  END IF;

  IF v_expert_changed THEN
    PERFORM public.recompute_user_dependability_ratings(NEW.expert_user_id);
    IF v_old_expert IS NOT NULL THEN
      PERFORM public.recompute_user_dependability_ratings(v_old_expert);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_recompute_dependability_ratings ON public.bookings;
CREATE TRIGGER bookings_recompute_dependability_ratings
AFTER INSERT OR DELETE
    OR UPDATE OF learner_dependability, expert_dependability, learner_user_id, expert_user_id
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.tg_bookings_recompute_dependability_ratings();

-- ---- One-time backfill of existing user averages ---------------------------

-- If any historical bookings already have per-side scores, push their averages
-- onto the user/expert rows now so dashboards stop showing static numbers as
-- soon as this migration lands.
DO $$
DECLARE
  v_uid uuid;
BEGIN
  FOR v_uid IN
    SELECT DISTINCT user_id FROM (
      SELECT learner_user_id AS user_id FROM public.bookings WHERE learner_dependability IS NOT NULL
      UNION
      SELECT expert_user_id  AS user_id FROM public.bookings WHERE expert_dependability  IS NOT NULL
    ) s
  LOOP
    PERFORM public.recompute_user_dependability_ratings(v_uid);
  END LOOP;
END $$;
