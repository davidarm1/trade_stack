-- Add office_sales_pitch column to quotes table.
-- Populated by the mobile quote-request flow (POST /api/v1/quotes/request) via AI parse.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS office_sales_pitch text;
