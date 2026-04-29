-- =============================================================================
-- RLS for public.tenants and public.staging_jobs (Security Advisor)
-- Run in Supabase → SQL Editor after fix_users_rls_recursion.sql (for
-- current_user_tenant_id).
--
-- tenants: authenticated users SELECT/UPDATE only their tenant row. Sign-up
--           insert/delete uses service_role and bypasses RLS.
-- staging_jobs: RLS enabled; if the table has tenant_id, same-tenant CRUD for
--               authenticated. If there is no tenant_id column, only RLS is
--               enabled (JWT clients get no rows; service_role still works).
-- =============================================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenants_select_own" ON public.tenants;
CREATE POLICY "tenants_select_own"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    id IS NOT NULL
    AND id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "tenants_update_own" ON public.tenants;
CREATE POLICY "tenants_update_own"
  ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (id = public.current_user_tenant_id())
  WITH CHECK (id = public.current_user_tenant_id());

DO $$
BEGIN
  IF to_regclass('public.staging_jobs') IS NOT NULL THEN
    ALTER TABLE public.staging_jobs ENABLE ROW LEVEL SECURITY;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'staging_jobs'
        AND column_name = 'tenant_id'
    ) THEN
      DROP POLICY IF EXISTS "staging_jobs_select_same_tenant" ON public.staging_jobs;
      CREATE POLICY "staging_jobs_select_same_tenant"
        ON public.staging_jobs
        FOR SELECT
        TO authenticated
        USING (
          tenant_id IS NOT NULL
          AND tenant_id = public.current_user_tenant_id()
        );

      DROP POLICY IF EXISTS "staging_jobs_insert_same_tenant" ON public.staging_jobs;
      CREATE POLICY "staging_jobs_insert_same_tenant"
        ON public.staging_jobs
        FOR INSERT
        TO authenticated
        WITH CHECK (
          tenant_id IS NOT NULL
          AND tenant_id = public.current_user_tenant_id()
        );

      DROP POLICY IF EXISTS "staging_jobs_update_same_tenant" ON public.staging_jobs;
      CREATE POLICY "staging_jobs_update_same_tenant"
        ON public.staging_jobs
        FOR UPDATE
        TO authenticated
        USING (tenant_id = public.current_user_tenant_id())
        WITH CHECK (tenant_id = public.current_user_tenant_id());

      DROP POLICY IF EXISTS "staging_jobs_delete_same_tenant" ON public.staging_jobs;
      CREATE POLICY "staging_jobs_delete_same_tenant"
        ON public.staging_jobs
        FOR DELETE
        TO authenticated
        USING (tenant_id = public.current_user_tenant_id());
    END IF;
  END IF;
END $$;
