-- Platform support sessions.
-- A platform admin (public.platform_admins, MFA enforced in the app) can open a
-- time-limited "support" membership in any company. Because the app and RLS
-- resolve the current company from the user's latest-updated ACTIVE membership,
-- the admin then sees that company exactly as a member with the chosen role
-- would. Ending the session (or expiry) drops them back to where they were.
--
-- Support memberships are flagged so they can be hidden from team lists and
-- never count as a real owner, and every start/end is written to audit_log by
-- the app.

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS is_support boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS support_reason text;

CREATE INDEX IF NOT EXISTS memberships_support_idx
  ON public.memberships (user_id)
  WHERE is_support;

-- Same function as supabase/sql/fix_users_rls_recursion.sql, plus: ignore
-- memberships whose expires_at has passed.
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
      AND (m.expires_at IS NULL OR m.expires_at > now())
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
