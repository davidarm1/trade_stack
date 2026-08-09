-- Tenant-scoped timesheets. No RLS policy for this table was found in any
-- prior migration — unlike quotes/settings/receipts, which each got a
-- dedicated RLS migration, timesheets appears to have been relying on the
-- website's server actions manually filtering by tenant_id in application
-- code. That's not sufficient once the mobile app starts writing to this
-- table directly from the client (job-sheet completion → per-visit
-- timesheet row), so this adds the same tenant-scoped policy shape used
-- elsewhere. Requires public.current_user_tenant_id() (fix_users_rls /
-- 20260205120000).
--
-- Insert is restricted to the engineer's own row (user_id = auth.uid()),
-- matching the stock_movements pattern — an engineer can log their own
-- visit, not someone else's.
--
-- CRITICAL: approveTimesheet (src/actions/timesheets.ts) already runs
-- live in production via requireApproverContext + an .update() call,
-- using the anon-key client (not service role). Enabling RLS here
-- without an UPDATE policy would silently break that existing feature —
-- so this also grants UPDATE to owner/office, using the same
-- public.current_user_role() function already used for role-gated RLS
-- elsewhere (see supabase/sql/jobs_rls_by_role.sql, job_invoice_versions.sql).

REVOKE ALL ON TABLE public.timesheets FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.timesheets TO authenticated;

ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timesheets_select_same_tenant" ON public.timesheets;
CREATE POLICY "timesheets_select_same_tenant"
  ON public.timesheets
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "timesheets_insert_own" ON public.timesheets;
CREATE POLICY "timesheets_insert_own"
  ON public.timesheets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "timesheets_update_approver" ON public.timesheets;
CREATE POLICY "timesheets_update_approver"
  ON public.timesheets
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
