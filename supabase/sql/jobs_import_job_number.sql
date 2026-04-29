-- Run in Supabase SQL editor if you are not applying migrations.
-- Display job number: import_job_number when set (imports), else jobs.id for new jobs.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS import_job_number text;

COMMENT ON COLUMN public.jobs.import_job_number IS
  'Legacy/reference job number from data import. When null, UI shows jobs.id.';
