-- Columns for B2 public URLs from generate-jobsheet / save-signature APIs.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS jobsheet_url text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS signature_url text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS signed_at timestamptz;

COMMENT ON COLUMN public.jobs.jobsheet_url IS 'Public URL of generated job sheet PDF (Backblaze B2).';
COMMENT ON COLUMN public.jobs.signature_url IS 'Public URL of client signature image (Backblaze B2).';
COMMENT ON COLUMN public.jobs.signed_at IS 'When the client signature was captured.';
