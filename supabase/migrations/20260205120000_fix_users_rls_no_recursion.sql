-- Synced with supabase/sql/fix_users_rls_recursion.sql — run via Supabase CLI or SQL Editor.

CREATE OR REPLACE FUNCTION public.current_user_membership_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_id uuid;
BEGIN
  IF to_regclass('public.memberships') IS NOT NULL THEN
    SELECT m.id
    INTO v_membership_id
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.status = 'active'
    ORDER BY m.updated_at DESC, m.created_at DESC
    LIMIT 1;

    RETURN v_membership_id;
  END IF;

  SELECT u.active_company_id
  INTO v_membership_id
  FROM public.users u
  WHERE u.id = auth.uid();

  RETURN v_membership_id;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_membership_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_membership_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_membership_id() TO service_role;

CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF to_regclass('public.memberships') IS NOT NULL THEN
    SELECT m.company_id
    INTO v_tenant_id
    FROM public.memberships m
    WHERE m.id = public.current_user_membership_id()
    LIMIT 1;

    RETURN v_tenant_id;
  END IF;

  SELECT u.tenant_id
  INTO v_tenant_id
  FROM public.users u
  WHERE u.id = auth.uid();

  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_tenant_id() TO service_role;

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

CREATE POLICY "users_update_same_tenant"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());
