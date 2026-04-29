-- Labels the Trade Stack UI uses for `public.jobs.status` (enum `job_status`).
-- Postgres requires this transaction to COMMIT before new enum values can be used
-- (e.g. in a DEFAULT). The default is set in 20260417150100_job_status_default_open.sql.

ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'open';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'scheduled';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'invoiced';
