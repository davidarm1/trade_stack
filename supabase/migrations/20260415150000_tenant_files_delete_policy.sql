-- Allow authenticated users to delete their tenant's file metadata (e.g. receipt delete + dedup cleanup).
GRANT DELETE ON public.tenant_files TO authenticated;

DROP POLICY IF EXISTS "tenant_files_delete_same_tenant" ON public.tenant_files;
CREATE POLICY "tenant_files_delete_same_tenant"
  ON public.tenant_files
  FOR DELETE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id());
