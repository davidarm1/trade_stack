-- Log each time an invoice is sent (including resends). Requires
-- public.current_user_tenant_id() and public.current_user_role() (see prior migrations).

CREATE TABLE public.job_invoice_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL,
  sent_to_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX job_invoice_send_log_job_id_sent_at_idx
  ON public.job_invoice_send_log (job_id, sent_at DESC);

CREATE INDEX job_invoice_send_log_tenant_id_idx
  ON public.job_invoice_send_log (tenant_id);

COMMENT ON TABLE public.job_invoice_send_log IS
  'Append-only history of invoice sends per job (initial send + resends).';

COMMENT ON COLUMN public.job_invoice_send_log.sent_at IS
  'Timestamp recorded on jobs.invoice_sent_at when the send/resend occurred.';

COMMENT ON COLUMN public.job_invoice_send_log.sent_to_email IS
  'Snapshot of jobs.invoice_sent_to_email at send time.';

-- Append row whenever invoice_sent_at is set or changes (each resend updates the column).
CREATE OR REPLACE FUNCTION public.jobs_log_invoice_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.invoice_sent_at IS NOT NULL THEN
      INSERT INTO public.job_invoice_send_log (tenant_id, job_id, sent_at, sent_to_email)
      VALUES (NEW.tenant_id, NEW.id, NEW.invoice_sent_at, NEW.invoice_sent_to_email);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.invoice_sent_at IS NOT NULL
       AND (OLD.invoice_sent_at IS DISTINCT FROM NEW.invoice_sent_at) THEN
      INSERT INTO public.job_invoice_send_log (tenant_id, job_id, sent_at, sent_to_email)
      VALUES (NEW.tenant_id, NEW.id, NEW.invoice_sent_at, NEW.invoice_sent_to_email);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_log_invoice_send_trigger ON public.jobs;

CREATE TRIGGER jobs_log_invoice_send_trigger
  AFTER INSERT OR UPDATE OF invoice_sent_at ON public.jobs
  FOR EACH ROW
  EXECUTE PROCEDURE public.jobs_log_invoice_send();

REVOKE ALL ON TABLE public.job_invoice_send_log FROM PUBLIC;
GRANT SELECT ON TABLE public.job_invoice_send_log TO authenticated;

ALTER TABLE public.job_invoice_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_invoice_send_log_select_by_role" ON public.job_invoice_send_log;

CREATE POLICY "job_invoice_send_log_select_by_role"
  ON public.job_invoice_send_log
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = job_invoice_send_log.job_id
        AND j.tenant_id = job_invoice_send_log.tenant_id
        AND j.deleted_at IS NULL
        AND (
          public.current_user_role() IN ('owner', 'office', 'viewer')
          OR (
            public.current_user_role() = 'engineer'
            AND j.assigned_engineer_id = auth.uid()
          )
        )
    )
  );

-- One row per job that already has invoice_sent_at (approximates first send before logging existed).
INSERT INTO public.job_invoice_send_log (tenant_id, job_id, sent_at, sent_to_email)
SELECT j.tenant_id, j.id, j.invoice_sent_at, j.invoice_sent_to_email
FROM public.jobs j
WHERE j.invoice_sent_at IS NOT NULL
  AND j.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.job_invoice_send_log l
    WHERE l.job_id = j.id
  );
