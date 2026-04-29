-- Align `public.quote_status` with Trade Stack (filters, create quote, AI price, book job).
-- Safe to re-run: ADD VALUE IF NOT EXISTS (Postgres 15+). Requires type `public.quote_status`.
--
-- If this fails ("type quote_status does not exist"), list your enum name with:
--   SELECT DISTINCT t.typname
--   FROM pg_enum e
--   JOIN pg_type t ON t.oid = e.enumtypid
--   WHERE t.typname ILIKE '%quote%';

ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'quoted';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'sent';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'declined';
ALTER TYPE public.quote_status ADD VALUE IF NOT EXISTS 'booked';

-- New rows omit `status` in the app → use this default once the label exists.
ALTER TABLE public.quotes
  ALTER COLUMN status SET DEFAULT 'pending'::quote_status;
