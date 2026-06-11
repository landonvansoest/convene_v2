-- Product policy: learner→expert messaging is always allowed; remove legacy mirror column if present.

ALTER TABLE public.expert_availability
  DROP COLUMN IF EXISTS allow_pre_booking_messaging;
