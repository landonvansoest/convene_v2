-- Allow bookings to be marked cancelled (matches app cancellation flow)

ALTER TYPE public.booking_session_status ADD VALUE IF NOT EXISTS 'cancelled';
