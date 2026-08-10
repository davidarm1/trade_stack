-- Allow jobs to opt out of the client-signature gate.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS signature_required boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.jobs.signature_required IS 'Whether this job must wait for client signature before engineer completion / approval.';
