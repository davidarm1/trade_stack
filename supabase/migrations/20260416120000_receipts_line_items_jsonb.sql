-- Line-level detail for receipts (bookkeeper edits, CSV export). Stored as JSON array.
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.receipts.line_items IS
  'Line rows: [{ "description", "qty?", "price?", "total?", "net?", "tax?" }].';
