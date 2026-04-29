ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'quoted';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'sent';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'declined';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'booked';

ALTER TABLE public.quotes
  ALTER COLUMN status SET DEFAULT 'pending'::quote_status;
