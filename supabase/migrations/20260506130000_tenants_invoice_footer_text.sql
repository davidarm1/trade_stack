-- Adds a custom invoice footer text column to tenants.
-- Falls back to "Thank you for your business." in the PDF if null.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS invoice_footer_text text;
