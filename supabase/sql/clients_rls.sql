-- =============================================================================
-- Row level security for public.clients
-- Run in Supabase → SQL Editor after fix_users_rls_recursion.sql
--
-- Without a SELECT policy, the app user cannot read clients even when jobs
-- expose client_id — e.g. engineers see jobs (jobs_select_by_role) but the
-- jobs list query that loads company_name from clients returns no rows.
-- =============================================================================

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select_same_tenant" ON public.clients;
CREATE POLICY "clients_select_same_tenant"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "clients_insert_same_tenant" ON public.clients;
CREATE POLICY "clients_insert_same_tenant"
  ON public.clients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "clients_update_same_tenant" ON public.clients;
CREATE POLICY "clients_update_same_tenant"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());
