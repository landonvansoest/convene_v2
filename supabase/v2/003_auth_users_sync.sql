-- Convene v2 — keep public.users aligned with auth.users (Bible: user_id = auth.users.id)
-- Run in Supabase SQL Editor as a privileged role (postgres).
-- Requires 002_core_schema.sql

-- Tie profile row lifecycle to Auth
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_user_id_fkey;

ALTER TABLE public.users
  ADD CONSTRAINT users_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    user_id,
    email_address,
    email_verified,
    first_name,
    last_name
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    (NEW.email_confirmed_at IS NOT NULL),
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', '')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email_address = EXCLUDED.email_address,
    email_verified = EXCLUDED.email_verified,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users SET
    email_address = COALESCE(NEW.email, email_address),
    email_verified = (NEW.email_confirmed_at IS NOT NULL),
    first_name = COALESCE(NEW.raw_user_meta_data ->> 'first_name', first_name),
    last_name = COALESCE(NEW.raw_user_meta_data ->> 'last_name', last_name),
    updated_at = now()
  WHERE user_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (
    OLD.email IS DISTINCT FROM NEW.email
    OR OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at
    OR OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data
  )
  EXECUTE PROCEDURE public.handle_auth_user_updated();

-- Supabase Auth can invoke these triggers
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_auth_user_updated() TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_auth_user_updated() FROM PUBLIC, anon, authenticated;
