-- Tenant-scoped settings (e.g. quotes_ai_pricing_prompt). Requires
-- public.current_user_tenant_id() (fix_users_rls / 20260205120000).

REVOKE ALL ON TABLE public.settings FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.settings TO authenticated;

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select_same_tenant" ON public.settings;
CREATE POLICY "settings_select_same_tenant"
  ON public.settings
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "settings_insert_same_tenant" ON public.settings;
CREATE POLICY "settings_insert_same_tenant"
  ON public.settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "settings_update_same_tenant" ON public.settings;
CREATE POLICY "settings_update_same_tenant"
  ON public.settings
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());
