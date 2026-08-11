-- Add tenant bank details for invoice payment instructions.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_sort_code text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_iban text,
  ADD COLUMN IF NOT EXISTS bank_swift text;

COMMENT ON COLUMN public.tenants.bank_account_name IS 'Invoice payment account name shown to clients.';
COMMENT ON COLUMN public.tenants.bank_name IS 'Invoice payment bank name shown to clients.';
COMMENT ON COLUMN public.tenants.bank_sort_code IS 'Invoice payment sort code shown to UK clients.';
COMMENT ON COLUMN public.tenants.bank_account_number IS 'Invoice payment account number shown to UK clients.';
COMMENT ON COLUMN public.tenants.bank_iban IS 'Invoice payment IBAN shown to clients where relevant.';
COMMENT ON COLUMN public.tenants.bank_swift IS 'Invoice payment SWIFT/BIC shown to clients where relevant.';
