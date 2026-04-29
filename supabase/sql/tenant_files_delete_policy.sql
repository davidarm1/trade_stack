-- Run if tenant_files DELETE fails from the app (receipt delete / dedup orphan cleanup).
-- See migration 20260415150000_tenant_files_delete_policy.sql

GRANT DELETE ON public.tenant_files TO authenticated;

DROP POLICY IF EXISTS "tenant_files_delete_same_tenant" ON public.tenant_files;
CREATE POLICY "tenant_files_delete_same_tenant"
  ON public.tenant_files
  FOR DELETE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id());
