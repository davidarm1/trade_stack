-- Receipts RLS: allow authenticated users within their own tenant.

REVOKE ALL ON TABLE public.receipts FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.receipts TO authenticated;

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipts_select_same_tenant" ON public.receipts;
CREATE POLICY "receipts_select_same_tenant"
  ON public.receipts
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS "receipts_insert_same_tenant" ON public.receipts;
CREATE POLICY "receipts_insert_same_tenant"
  ON public.receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS "receipts_update_same_tenant" ON public.receipts;
CREATE POLICY "receipts_update_same_tenant"
  ON public.receipts
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS "receipts_delete_same_tenant" ON public.receipts;
CREATE POLICY "receipts_delete_same_tenant"
  ON public.receipts
  FOR DELETE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id());
