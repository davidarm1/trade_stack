-- Van maintenance: per-vehicle record with MOT/insurance renewal dates,
-- plus a maintenance log. Requires public.current_user_tenant_id()
-- (fix_users_rls / 20260205120000).

CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  registration text NOT NULL,
  make_model text,
  assigned_user_id uuid REFERENCES public.memberships(id),
  mot_due_date date,
  insurance_renewal_date date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicles_tenant_id_idx ON public.vehicles (tenant_id);

CREATE TABLE IF NOT EXISTS public.vehicle_maintenance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  logged_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  cost numeric,
  receipt_id uuid REFERENCES public.receipts(id),
  created_by_id uuid REFERENCES public.memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_maintenance_log_tenant_id_idx
  ON public.vehicle_maintenance_log (tenant_id);
CREATE INDEX IF NOT EXISTS vehicle_maintenance_log_vehicle_id_idx
  ON public.vehicle_maintenance_log (vehicle_id);

-- Now that public.vehicles exists, point stock_movements.vehicle_id at it
-- (column was added loose-typed in 20260806090000_stock_items_and_movements.sql).
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_vehicle_id_fkey
  FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id);

-- RLS: vehicles
REVOKE ALL ON TABLE public.vehicles FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.vehicles TO authenticated;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicles_select_same_tenant" ON public.vehicles;
CREATE POLICY "vehicles_select_same_tenant"
  ON public.vehicles
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "vehicles_insert_same_tenant" ON public.vehicles;
CREATE POLICY "vehicles_insert_same_tenant"
  ON public.vehicles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "vehicles_update_same_tenant" ON public.vehicles;
CREATE POLICY "vehicles_update_same_tenant"
  ON public.vehicles
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- RLS: vehicle_maintenance_log (append-only)
REVOKE ALL ON TABLE public.vehicle_maintenance_log FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.vehicle_maintenance_log TO authenticated;
ALTER TABLE public.vehicle_maintenance_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_maintenance_log_select_same_tenant"
  ON public.vehicle_maintenance_log;
CREATE POLICY "vehicle_maintenance_log_select_same_tenant"
  ON public.vehicle_maintenance_log
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "vehicle_maintenance_log_insert_same_tenant"
  ON public.vehicle_maintenance_log;
CREATE POLICY "vehicle_maintenance_log_insert_same_tenant"
  ON public.vehicle_maintenance_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );
