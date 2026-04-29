-- Step 2 of 2: run only after job_status_app_labels.sql has committed.

ALTER TABLE public.jobs
  ALTER COLUMN status SET DEFAULT 'open'::job_status;
