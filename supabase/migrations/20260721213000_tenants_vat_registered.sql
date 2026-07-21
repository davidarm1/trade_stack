ALTER TABLE public.tenants
  ADD COLUMN vat_registered boolean NOT NULL DEFAULT false;

UPDATE public.tenants
SET vat_registered = true
WHERE vat_number IS NOT NULL
   OR default_vat_rate > 0;
