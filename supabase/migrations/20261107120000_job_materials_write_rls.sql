-- Row-level security for job line items (job_materials).
-- No policy for this table exists in any prior migration, so inserts from the
-- invoice panel / new job form failed with "new row violates row-level
-- security policy", and rows that did get inserted could not be read back.
-- SELECT mirrors job_invoice_versions: owner/office/viewer see the tenant's
-- jobs' items, engineers only for jobs assigned to them. Writes: owner/office.
-- Requires public.current_user_tenant_id() and public.current_user_role().

REVOKE ALL ON TABLE public.job_materials FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_materials TO authenticated;

ALTER TABLE public.job_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_materials_select_by_role" ON public.job_materials;
CREATE POLICY "job_materials_select_by_role"
  ON public.job_materials
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = job_materials.job_id
        AND j.tenant_id = job_materials.tenant_id
        AND j.deleted_at IS NULL
        AND (
          public.current_user_role() IN ('owner', 'office', 'viewer')
          OR (
            public.current_user_role() = 'engineer'
            AND j.assigned_engineer_membership_id = public.current_user_membership_id()
          )
        )
    )
  );

DROP POLICY IF EXISTS "job_materials_insert_office" ON public.job_materials;
CREATE POLICY "job_materials_insert_office"
  ON public.job_materials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
    AND public.current_user_role() IN ('owner', 'office')
  );

DROP POLICY IF EXISTS "job_materials_update_office" ON public.job_materials;
CREATE POLICY "job_materials_update_office"
  ON public.job_materials
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

DROP POLICY IF EXISTS "job_materials_delete_office" ON public.job_materials;
CREATE POLICY "job_materials_delete_office"
  ON public.job_materials
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_role() IN ('owner', 'office')
  );
