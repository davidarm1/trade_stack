ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS receipts_job_id_idx
  ON public.receipts (job_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS receipts_client_id_idx
  ON public.receipts (client_id)
  WHERE client_id IS NOT NULL;

COMMENT ON COLUMN public.receipts.job_id IS
  'Optional job this receipt/materials cost was scanned against from the mobile job sheet.';

COMMENT ON COLUMN public.receipts.client_id IS
  'Optional client associated with the scanned receipt/materials cost.';

CREATE OR REPLACE FUNCTION public.validate_receipt_job_client_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  job_tenant uuid;
  job_client uuid;
  client_tenant uuid;
BEGIN
  IF NEW.job_id IS NOT NULL THEN
    SELECT tenant_id, client_id
      INTO job_tenant, job_client
      FROM public.jobs
      WHERE id = NEW.job_id;

    IF job_tenant IS NULL OR job_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'receipt job_id must belong to the same tenant';
    END IF;

    IF NEW.client_id IS NOT NULL AND job_client IS NOT NULL AND job_client <> NEW.client_id THEN
      RAISE EXCEPTION 'receipt client_id must match the linked job client';
    END IF;
  END IF;

  IF NEW.client_id IS NOT NULL THEN
    SELECT tenant_id
      INTO client_tenant
      FROM public.clients
      WHERE id = NEW.client_id;

    IF client_tenant IS NULL OR client_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'receipt client_id must belong to the same tenant';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS receipts_validate_job_client_tenant ON public.receipts;
CREATE TRIGGER receipts_validate_job_client_tenant
  BEFORE INSERT OR UPDATE OF tenant_id, job_id, client_id
  ON public.receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_receipt_job_client_tenant();
