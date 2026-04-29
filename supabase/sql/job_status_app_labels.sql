-- Step 1 of 2: add enum labels. Run and let the session finish (Supabase: one query batch).
-- Step 2: run job_status_default_open.sql in a new query (new transaction).

ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'open';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'scheduled';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'invoiced';
