-- ISO 4217 code for UI money formatting (Settings → Currency).
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS currency text;

COMMENT ON COLUMN public.tenants.currency IS 'ISO 4217 code (e.g. GBP, EUR).';
