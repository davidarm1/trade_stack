-- INSERT/UPDATE for jobs (quote → job, new job, edits). Does not replace role-based
-- SELECT policies if you already use jobs_rls_by_role.sql — it only adds writes.
-- Requires public.current_user_tenant_id() (fix_users_rls / 20260205120000).

REVOKE ALL ON TABLE public.jobs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.jobs TO authenticated;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs_insert_same_tenant" ON public.jobs;
CREATE POLICY "jobs_insert_same_tenant"
  ON public.jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "jobs_update_same_tenant" ON public.jobs;
CREATE POLICY "jobs_update_same_tenant"
  ON public.jobs
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());
