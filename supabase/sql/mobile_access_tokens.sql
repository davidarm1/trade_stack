-- Manual SQL copy of migration 20260420110000_mobile_access_tokens.sql.

CREATE TABLE IF NOT EXISTS public.mobile_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  token_hint text NOT NULL,
  created_by_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_access_tokens_hash
  ON public.mobile_access_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_mobile_access_tokens_user_created
  ON public.mobile_access_tokens (tenant_id, user_id, created_at DESC);

ALTER TABLE public.mobile_access_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mobile_access_tokens_select_same_tenant" ON public.mobile_access_tokens;
CREATE POLICY "mobile_access_tokens_select_same_tenant"
  ON public.mobile_access_tokens
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS "mobile_access_tokens_insert_same_tenant" ON public.mobile_access_tokens;
CREATE POLICY "mobile_access_tokens_insert_same_tenant"
  ON public.mobile_access_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS "mobile_access_tokens_update_same_tenant" ON public.mobile_access_tokens;
CREATE POLICY "mobile_access_tokens_update_same_tenant"
  ON public.mobile_access_tokens
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());
