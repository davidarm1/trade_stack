-- =============================================================================
-- Fix: "infinite recursion detected in policy for relation users"
-- Run in Supabase → SQL Editor (whole file).
--
-- Why it happens: Policies ON public.users that contain subqueries like
--   (SELECT tenant_id FROM users WHERE id = auth.uid())
-- re-enter RLS on `users` → infinite recursion.
--
-- Fix: Use SECURITY DEFINER helpers so the lookup of your tenant_id does NOT
-- re-apply RLS on `users`. Policies then only compare scalars / auth.uid().
-- =============================================================================

-- 1) Tenant lookup for the logged-in auth user (bypasses RLS safely)
CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_user_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_tenant_id() TO service_role;

COMMENT ON FUNCTION public.current_user_tenant_id() IS
  'Returns public.users.tenant_id for auth.uid(); SECURITY DEFINER avoids RLS recursion.';

-- 2) Drop all existing policies on public.users (recursion-safe reset)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- SELECT: own row (no subquery on users) OR same-tenant colleagues
CREATE POLICY "users_select_own_or_same_tenant"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR (
      tenant_id IS NOT NULL
      AND tenant_id = public.current_user_tenant_id()
    )
  );

-- UPDATE: same tenant only (adjust later for role-based rules)
CREATE POLICY "users_update_same_tenant"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- INSERT/DELETE: app uses service_role for bootstrap; service_role bypasses RLS in Supabase.
-- No authenticated INSERT — prevents clients from forging rows. Invites = server/service role.

-- =============================================================================
-- Other tables: avoid subqueries on public.users in policies. Prefer:
--   USING (tenant_id = public.current_user_tenant_id())
-- =============================================================================
