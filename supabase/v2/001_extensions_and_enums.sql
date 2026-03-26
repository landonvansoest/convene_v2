-- Convene v2 — extensions and enums (Bible rev3)
-- Run in a new Supabase project before 002_core_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Expert lifecycle (Bible: active / pending / temp)
DO $$ BEGIN
  CREATE TYPE expert_status AS ENUM ('active', 'pending', 'temp');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Booking session lifecycle (Bible: upcoming, live, complete)
DO $$ BEGIN
  CREATE TYPE booking_session_status AS ENUM ('upcoming', 'live', 'complete');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM (
    'active',
    'trialing',
    'past_due',
    'canceled',
    'unpaid'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM (
    'session_booking',
    'session_extension',
    'freelance_work',
    'package_purchase',
    'custom_offer',
    'adjustment'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE freelance_work_status AS ENUM ('offered', 'approved', 'complete');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE expert_package_status AS ENUM ('active', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE faq_publish_status AS ENUM ('draft', 'published');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE first_session_discount_type AS ENUM ('percent', 'fixed_amount');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE discount_redemption_status AS ENUM ('pending', 'consumed', 'voided');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE offer_type AS ENUM (
    'first_session_discount',
    'package_deal',
    'custom_offer',
    'freelance_prep',
    'time_suggestion',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE offer_status AS ENUM ('offered', 'accepted', 'denied', 'cancelled', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE template_publish_status AS ENUM ('draft', 'published');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
