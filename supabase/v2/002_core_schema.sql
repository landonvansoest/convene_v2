-- Convene v2 — core tables (Bible rev3)
-- Requires 001_extensions_and_enums.sql
-- - Auth: use Supabase Auth; no password column in public.users.
-- - Derived display names: omit from physical tables; join to users in queries or add SQL views later.
-- - Authorization per Bible: application layer (no RLS reliance).

DO $$ BEGIN
  CREATE TYPE profile_visibility_state AS ENUM (
    'visible',
    'expert_pending_admin_review',
    'expert_hidden_incomplete_fields',
    'expert_hidden_payment_setup_incomplete',
    'learner_hidden_incomplete_fields',
    'learner_hidden_email_unverified',
    'hidden_unknown_or_error'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.users (
  user_id uuid PRIMARY KEY,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email_address text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  profile_photo text,
  phone_number text,
  hometown text,
  time_zone text,
  language text,
  profession text,
  introduction text,
  birthday date,
  gender text,
  has_expert_profile boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sessions_booked integer NOT NULL DEFAULT 0,
  sessions_completed integer NOT NULL DEFAULT 0,
  learner_dependability_rating integer,
  online boolean NOT NULL DEFAULT false,
  profile_visibility_state profile_visibility_state NOT NULL DEFAULT 'learner_hidden_incomplete_fields'
);

CREATE UNIQUE INDEX users_email_lower_idx ON public.users ((lower(email_address)));

CREATE TABLE public.categories (
  category_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.expert_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.users (user_id) ON DELETE CASCADE,
  expert_profile_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expert_status expert_status NOT NULL DEFAULT 'temp',
  experience_level text,
  category_id uuid REFERENCES public.categories (category_id),
  qualifications text,
  expert_bio text,
  about_services text,
  skills_specializations text[] NOT NULL DEFAULT '{}',
  is_verified boolean NOT NULL DEFAULT false,
  expert_dependability_rating integer,
  complete_sessions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector,
  profile_embedding vector(1536),
  embedding_updated_at timestamptz
);

CREATE INDEX expert_profiles_search_vector_idx ON public.expert_profiles USING gin (search_vector);
CREATE INDEX expert_profiles_category_idx ON public.expert_profiles (category_id);

CREATE TABLE public.user_subscriptions (
  subscription_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_id text,
  status subscription_status NOT NULL,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_subscriptions_user_idx ON public.user_subscriptions (user_id);

CREATE TABLE public.expert_availability (
  user_id uuid PRIMARY KEY REFERENCES public.users (user_id) ON DELETE CASCADE,
  rate numeric(12, 2) NOT NULL DEFAULT 0,
  weekly_schedule jsonb NOT NULL DEFAULT '{}',
  availability_overrides jsonb NOT NULL DEFAULT '[]',
  available_now boolean NOT NULL DEFAULT false,
  available_until timestamptz,
  minimum_booking interval,
  maximum_booking interval,
  minimum_notice interval,
  maximum_notice interval,
  buffer_time integer,
  auto_accept boolean NOT NULL DEFAULT false,
  extend_sessions boolean NOT NULL DEFAULT false,
  allow_messaging boolean NOT NULL DEFAULT true,
  first_session_discount_enabled boolean NOT NULL DEFAULT false,
  first_session_discount_type first_session_discount_type,
  first_session_discount_value numeric(12, 4),
  first_session_discount_max_session_minutes integer,
  first_session_discount_effective_from timestamptz,
  first_session_discount_effective_until timestamptz,
  calendar_paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversations (
  conversation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  learner_user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  UNIQUE (learner_user_id, expert_user_id)
);

CREATE INDEX conversations_expert_idx ON public.conversations (expert_user_id);
CREATE INDEX conversations_learner_idx ON public.conversations (learner_user_id);

CREATE TABLE public.messages (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (conversation_id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX messages_conversation_created_idx ON public.messages (conversation_id, created_at);

CREATE TABLE public.bookings (
  booking_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE RESTRICT,
  learner_user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE RESTRICT,
  expert_profile_id uuid NOT NULL REFERENCES public.expert_profiles (expert_profile_id) ON DELETE RESTRICT,
  session_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  -- Derived from start_time/end_time for the same session_date (app-enforced; overnight sessions TBD in Bible).
  duration interval NOT NULL,
  rate numeric(12, 2) NOT NULL,
  discount_applied numeric(12, 2) NOT NULL DEFAULT 0,
  booking_amount numeric(12, 2) NOT NULL DEFAULT 0,
  platform_fee numeric(12, 2) NOT NULL DEFAULT 0,
  taxes_fees numeric(12, 2) NOT NULL DEFAULT 0,
  total_amount numeric(12, 2) NOT NULL DEFAULT 0,
  extensions integer NOT NULL DEFAULT 0,
  extensions_amount numeric(12, 2) NOT NULL DEFAULT 0,
  status booking_session_status NOT NULL DEFAULT 'upcoming',
  payment_status text NOT NULL DEFAULT 'pending',
  meeting_room_url text,
  daily_room_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.users (user_id),
  cancellation_reason text,
  expert_joined timestamptz,
  learner_joined timestamptz,
  expert_delay integer,
  learner_delay integer,
  expert_dependability integer,
  learner_dependability integer,
  pending_reschedule_date date,
  pending_reschedule_start_time time,
  pending_reschedule_end_time time,
  reschedule_request_id uuid REFERENCES public.messages (message_id),
  chat_transcript text,
  session_transcript text
);

CREATE INDEX bookings_expert_idx ON public.bookings (expert_user_id, session_date);
CREATE INDEX bookings_learner_idx ON public.bookings (learner_user_id, session_date);

CREATE TABLE public.freelance_work (
  freelance_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status freelance_work_status NOT NULL DEFAULT 'offered',
  expert_user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  learner_user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  duration interval,
  description_of_work text,
  deadline timestamptz,
  rate numeric(12, 2),
  total_price numeric(12, 2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  work_deadline timestamptz,
  completion_submitted_at timestamptz,
  learner_completion_deadline_at timestamptz,
  expert_grace_end_at timestamptz,
  rectification_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.expert_packages (
  package_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  title text NOT NULL,
  status expert_package_status NOT NULL DEFAULT 'active',
  description text,
  session_count integer NOT NULL CHECK (session_count >= 1),
  session_duration_minutes integer NOT NULL CHECK (session_duration_minutes > 0),
  price_cents bigint,
  stripe_price_id text,
  currency text NOT NULL DEFAULT 'USD',
  is_published boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  credit_expiration_days integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expert_packages_price_chk CHECK (
    NOT is_published OR price_cents IS NOT NULL OR stripe_price_id IS NOT NULL
  )
);

CREATE INDEX expert_packages_expert_idx ON public.expert_packages (expert_user_id);

CREATE TABLE public.learner_package_credits (
  credit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.expert_packages (package_id) ON DELETE CASCADE,
  learner_user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  remaining_credits integer NOT NULL CHECK (remaining_credits >= 0),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expiration_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.package_credit_redemptions (
  redemption_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid NOT NULL REFERENCES public.learner_package_credits (credit_id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings (booking_id) ON DELETE CASCADE,
  credits_used integer NOT NULL CHECK (credits_used > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.discount_redemptions (
  redemption_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  learner_user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings (booking_id) ON DELETE SET NULL,
  discount_type first_session_discount_type,
  discount_value_applied numeric(12, 4),
  status discount_redemption_status NOT NULL DEFAULT 'pending',
  used_at timestamptz,
  stripe_checkout_session_id text,
  payment_intent_id text,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expert_user_id, learner_user_id)
);

CREATE TABLE public.transactions (
  transaction_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type transaction_type NOT NULL,
  booking_id uuid REFERENCES public.bookings (booking_id) ON DELETE SET NULL,
  freelance_id uuid REFERENCES public.freelance_work (freelance_id) ON DELETE SET NULL,
  package_id uuid REFERENCES public.expert_packages (package_id) ON DELETE SET NULL,
  expert_user_id uuid REFERENCES public.users (user_id) ON DELETE SET NULL,
  learner_user_id uuid REFERENCES public.users (user_id) ON DELETE SET NULL,
  booking_amount numeric(12, 2) NOT NULL DEFAULT 0,
  extensions_amount numeric(12, 2) NOT NULL DEFAULT 0,
  platform_fee numeric(12, 2) NOT NULL DEFAULT 0,
  taxes_fees numeric(12, 2) NOT NULL DEFAULT 0,
  total_charge numeric(12, 2) NOT NULL DEFAULT 0,
  expert_earnings numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  transaction_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Enforce “exactly one primary link” per transaction_type in application code (Bible ledger section).

CREATE INDEX transactions_learner_idx ON public.transactions (learner_user_id);
CREATE INDEX transactions_expert_idx ON public.transactions (expert_user_id);
CREATE INDEX transactions_booking_idx ON public.transactions (booking_id);

CREATE TABLE public.reviews_of_experts (
  review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (booking_id) ON DELETE CASCADE,
  learner_reviewer_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  expert_reviewee_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  overall_rating smallint NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  questions_rating smallint CHECK (questions_rating BETWEEN 1 AND 5),
  knowledgeable_rating smallint CHECK (knowledgeable_rating BETWEEN 1 AND 5),
  personable_rating smallint CHECK (personable_rating BETWEEN 1 AND 5),
  public_review text,
  private_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, learner_reviewer_id)
);

CREATE TABLE public.reviews_of_learners (
  review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (booking_id) ON DELETE CASCADE,
  expert_reviewer_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  learner_reviewee_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  overall_rating smallint NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  prepared_rating smallint CHECK (prepared_rating BETWEEN 1 AND 5),
  respectful_rating smallint CHECK (respectful_rating BETWEEN 1 AND 5),
  personable_rating smallint CHECK (personable_rating BETWEEN 1 AND 5),
  public_review text,
  private_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, expert_reviewer_id)
);

CREATE TABLE public.requests (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category_id uuid REFERENCES public.categories (category_id),
  skills text[] NOT NULL DEFAULT '{}' CHECK (cardinality(skills) <= 10),
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  response_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX requests_user_idx ON public.requests (user_id);
CREATE INDEX requests_category_idx ON public.requests (category_id);

CREATE TABLE public.request_responses (
  response_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests (request_id) ON DELETE CASCADE,
  expert_user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  is_seen boolean NOT NULL DEFAULT false,
  upvote_count integer NOT NULL DEFAULT 0,
  responded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX request_responses_request_idx ON public.request_responses (request_id);

CREATE TABLE public.seen_requests (
  request_id uuid NOT NULL REFERENCES public.requests (request_id) ON DELETE CASCADE,
  expert_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, expert_id)
);

CREATE TABLE public.archived_requests (
  request_id uuid NOT NULL REFERENCES public.requests (request_id) ON DELETE CASCADE,
  expert_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, expert_id)
);

CREATE TABLE public.request_response_upvotes (
  response_id uuid NOT NULL REFERENCES public.request_responses (response_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (response_id, user_id)
);

CREATE TABLE public.message_response_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (conversation_id) ON DELETE CASCADE,
  expert_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  learner_message_id uuid NOT NULL REFERENCES public.messages (message_id) ON DELETE CASCADE,
  expert_message_id uuid NOT NULL REFERENCES public.messages (message_id) ON DELETE CASCADE,
  response_time_seconds integer NOT NULL CHECK (response_time_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_message_id)
);

CREATE TABLE public.expert_response_time_stats (
  expert_id uuid PRIMARY KEY REFERENCES public.users (user_id) ON DELETE CASCADE,
  response_interval_count integer NOT NULL DEFAULT 0,
  total_response_time_seconds bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Bible names table "FAQ"; use public.faq for clarity in SQL.
CREATE TABLE public.faq (
  faq_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  status faq_publish_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Offers / booking_offers (Bible narrative; formal ledger still in transactions).
CREATE TABLE public.offers (
  offer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_type offer_type NOT NULL,
  from_user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.users (user_id) ON DELETE CASCADE,
  status offer_status NOT NULL DEFAULT 'offered',
  payload jsonb NOT NULL DEFAULT '{}',
  creates_booking_id uuid REFERENCES public.bookings (booking_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Waitlist / staff review when "Become an Expert" feature flag is off.
CREATE TABLE public.new_expert_requests (
  new_expert_request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email_address text NOT NULL,
  hometown text,
  profession text,
  category_id uuid REFERENCES public.categories (category_id),
  other_category text,
  qualifications text,
  years_experience numeric(6, 1),
  teaching_experience text,
  social_links text,
  hours_per_week numeric(6, 1),
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.site_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.site_settings (id, data) VALUES (1, '{}')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.notification_templates (
  template_key text PRIMARY KEY,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status template_publish_status NOT NULL DEFAULT 'draft',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notification_outbox_pending_idx ON public.notification_outbox (created_at)
  WHERE processed_at IS NULL;
