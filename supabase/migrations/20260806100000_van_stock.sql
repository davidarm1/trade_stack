-- Van stock: what's currently allocated to each vehicle, with a
-- last-checked timestamp for periodic stock checks. References both
-- public.vehicles (20260806093000) and public.stock_items
-- (20260806090000). Requires public.current_user_tenant_id()
-- (fix_users_rls / 20260205120000).

CREATE TABLE IF NOT EXISTS public.van_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id),
  quantity numeric NOT NULL DEFAULT 0,
  last_checked_at timestamptz,
  last_checked_by_id uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, stock_item_id)
);

CREATE INDEX IF NOT EXISTS van_stock_tenant_id_idx ON public.van_stock (tenant_id);
CREATE INDEX IF NOT EXISTS van_stock_vehicle_id_idx ON public.van_stock (vehicle_id);

REVOKE ALL ON TABLE public.van_stock FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.van_stock TO authenticated;
ALTER TABLE public.van_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "van_stock_select_same_tenant" ON public.van_stock;
CREATE POLICY "van_stock_select_same_tenant"
  ON public.van_stock
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "van_stock_insert_same_tenant" ON public.van_stock;
CREATE POLICY "van_stock_insert_same_tenant"
  ON public.van_stock
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "van_stock_update_same_tenant" ON public.van_stock;
CREATE POLICY "van_stock_update_same_tenant"
  ON public.van_stock
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());
