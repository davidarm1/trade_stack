-- Run after 20260417150000 (enum values must be committed first).
-- New jobs from the app use status 'open' when the column has this default.

ALTER TABLE public.jobs
  ALTER COLUMN status SET DEFAULT 'open'::job_status;
