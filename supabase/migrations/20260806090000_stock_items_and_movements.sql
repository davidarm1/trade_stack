-- Store room inventory: item catalog + a movement ledger for booking stock
-- out (to a job) and back in, plus reorder thresholds. Requires
-- public.current_user_tenant_id() (fix_users_rls / 20260205120000).

CREATE TABLE IF NOT EXISTS public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  sku text,
  unit text,
  reorder_threshold numeric,
  current_qty numeric NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_items_tenant_id_idx ON public.stock_items (tenant_id);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id),
  direction text NOT NULL CHECK (direction IN ('out', 'in')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  job_id uuid REFERENCES public.jobs(id),
  vehicle_id uuid, -- FK added in the van_stock migration once public.vehicles exists
  user_id uuid NOT NULL REFERENCES public.users(id),
  notes text,
  moved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_tenant_id_idx ON public.stock_movements (tenant_id);
CREATE INDEX IF NOT EXISTS stock_movements_stock_item_id_idx ON public.stock_movements (stock_item_id);

-- RLS: stock_items
REVOKE ALL ON TABLE public.stock_items FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stock_items TO authenticated;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_items_select_same_tenant" ON public.stock_items;
CREATE POLICY "stock_items_select_same_tenant"
  ON public.stock_items
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "stock_items_insert_same_tenant" ON public.stock_items;
CREATE POLICY "stock_items_insert_same_tenant"
  ON public.stock_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "stock_items_update_same_tenant" ON public.stock_items;
CREATE POLICY "stock_items_update_same_tenant"
  ON public.stock_items
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- RLS: stock_movements (append-only ledger — no update/delete policy)
REVOKE ALL ON TABLE public.stock_movements FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.stock_movements TO authenticated;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_movements_select_same_tenant" ON public.stock_movements;
CREATE POLICY "stock_movements_select_same_tenant"
  ON public.stock_movements
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "stock_movements_insert_same_tenant" ON public.stock_movements;
CREATE POLICY "stock_movements_insert_same_tenant"
  ON public.stock_movements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
    AND user_id = auth.uid()
  );
