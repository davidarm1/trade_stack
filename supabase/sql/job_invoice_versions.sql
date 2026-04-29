-- Standalone copy of migration 20260417190000_job_invoice_versions.sql
-- (run in Supabase SQL Editor or via supabase db push / migrate)

CREATE TABLE public.job_invoice_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs (id) ON DELETE CASCADE,
  version_no int NOT NULL CHECK (version_no > 0),
  reason text,
  file_name text NOT NULL,
  b2_key text NOT NULL,
  public_url text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_by_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX job_invoice_versions_job_version_unique
  ON public.job_invoice_versions (job_id, version_no);

CREATE UNIQUE INDEX job_invoice_versions_one_current_per_job
  ON public.job_invoice_versions (job_id)
  WHERE is_current = true;

CREATE INDEX job_invoice_versions_tenant_job_created_idx
  ON public.job_invoice_versions (tenant_id, job_id, created_at DESC);

COMMENT ON TABLE public.job_invoice_versions IS
  'Immutable invoice PDF snapshots per job. One row can be marked as current.';

COMMENT ON COLUMN public.job_invoice_versions.reason IS
  'Optional reason for creating a new version (required by app from v2 onwards).';

REVOKE ALL ON TABLE public.job_invoice_versions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.job_invoice_versions TO authenticated;

ALTER TABLE public.job_invoice_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_invoice_versions_select_by_role" ON public.job_invoice_versions;
CREATE POLICY "job_invoice_versions_select_by_role"
  ON public.job_invoice_versions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = job_invoice_versions.job_id
        AND j.tenant_id = job_invoice_versions.tenant_id
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

DROP POLICY IF EXISTS "job_invoice_versions_insert_same_tenant" ON public.job_invoice_versions;
CREATE POLICY "job_invoice_versions_insert_same_tenant"
  ON public.job_invoice_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_role() IN ('owner', 'office')
  );

DROP POLICY IF EXISTS "job_invoice_versions_update_same_tenant" ON public.job_invoice_versions;
CREATE POLICY "job_invoice_versions_update_same_tenant"
  ON public.job_invoice_versions
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_role() IN ('owner', 'office')
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_role() IN ('owner', 'office')
  );
