-- Row level security for public.quotes (run after fix_users_rls_recursion.sql).

REVOKE ALL ON TABLE public.quotes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.quotes TO authenticated;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotes_select_same_tenant" ON public.quotes;
CREATE POLICY "quotes_select_same_tenant"
  ON public.quotes
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "quotes_insert_same_tenant" ON public.quotes;
CREATE POLICY "quotes_insert_same_tenant"
  ON public.quotes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "quotes_update_same_tenant" ON public.quotes;
CREATE POLICY "quotes_update_same_tenant"
  ON public.quotes
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());
