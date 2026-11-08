-- Scheduled invoice sending. The office picks a date/time; a cron (Railway)
-- calls /api/cron/send-scheduled-invoices, which sends anything due using the
-- service role. No new RLS is needed: the existing jobs policies cover these
-- columns for office users, and the cron route bypasses RLS.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS invoice_scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_scheduled_recipients text,
  ADD COLUMN IF NOT EXISTS invoice_scheduled_reason text,
  ADD COLUMN IF NOT EXISTS invoice_scheduled_by_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_scheduled_by_membership_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_schedule_status text,
  ADD COLUMN IF NOT EXISTS invoice_schedule_error text,
  ADD COLUMN IF NOT EXISTS invoice_schedule_claimed_at timestamptz;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_invoice_schedule_status_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_invoice_schedule_status_check
  CHECK (
    invoice_schedule_status IS NULL
    OR invoice_schedule_status IN ('scheduled', 'sending', 'sent', 'failed', 'cancelled')
  );

CREATE INDEX IF NOT EXISTS jobs_invoice_schedule_due_idx
  ON public.jobs (invoice_scheduled_for)
  WHERE invoice_schedule_status IN ('scheduled', 'sending');
