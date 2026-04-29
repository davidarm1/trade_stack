-- =============================================================================
-- Jobs visibility by role (run in Supabase SQL Editor after reviewing)
--
-- - owner, office, viewer: all jobs in their tenant (allocate / oversee)
-- - engineer: only rows where assigned_engineer_id = auth.uid()
--
-- Requires: public.current_user_tenant_id() (see fix_users_rls_recursion.sql)
-- Requires: public.users.role uses values: owner | office | engineer | viewer
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO service_role;

COMMENT ON FUNCTION public.current_user_role() IS
  'App role for auth.uid(); SECURITY DEFINER avoids RLS recursion on public.users';

-- Replace any single broad "jobs_select_same_tenant" policy with this logic:
DROP POLICY IF EXISTS "jobs_select_same_tenant" ON public.jobs;

CREATE POLICY "jobs_select_by_role"
  ON public.jobs
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
    AND (
      public.current_user_role() IN ('owner', 'office', 'viewer')
      OR (
        public.current_user_role() = 'engineer'
        AND assigned_engineer_id = auth.uid()
      )
    )
  );

-- TODO (optional): let engineers also see unassigned jobs in their tenant:
--   OR (public.current_user_role() = 'engineer' AND assigned_engineer_id IS NULL)
-- Only add if your product should show a pool of unassigned work to engineers.

-- =============================================================================
-- Write access — tighten to match your workflows (examples)
-- =============================================================================

-- DROP POLICY IF EXISTS "jobs_insert_same_tenant" ON public.jobs;
-- CREATE POLICY "jobs_insert_office_and_owner"
--   ON public.jobs FOR INSERT TO authenticated
--   WITH CHECK (
--     tenant_id = public.current_user_tenant_id()
--     AND public.current_user_role() IN ('owner', 'office')
--   );

-- CREATE POLICY "jobs_update_by_role"
--   ON public.jobs FOR UPDATE TO authenticated
--   USING (
--     tenant_id = public.current_user_tenant_id()
--     AND (
--       public.current_user_role() IN ('owner', 'office')
--       OR (
--         public.current_user_role() = 'engineer'
--         AND assigned_engineer_id = auth.uid()
--       )
--     )
--   )
--   WITH CHECK (tenant_id = public.current_user_tenant_id());
