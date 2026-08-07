-- Staff acceptance forms: owner/office publish required documents
-- (terms, handbook, policies); staff must accept the current version of
-- each before the app gates them. Requires public.current_user_tenant_id()
-- (fix_users_rls / 20260205120000).

CREATE TABLE IF NOT EXISTS public.onboarding_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  title text NOT NULL,
  body text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  required boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_documents_tenant_id_idx
  ON public.onboarding_documents (tenant_id);

CREATE TABLE IF NOT EXISTS public.staff_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  document_id uuid NOT NULL REFERENCES public.onboarding_documents(id),
  document_version integer NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, document_id, document_version)
);

CREATE INDEX IF NOT EXISTS staff_acceptances_tenant_id_idx
  ON public.staff_acceptances (tenant_id);
CREATE INDEX IF NOT EXISTS staff_acceptances_user_id_idx
  ON public.staff_acceptances (user_id);

-- RLS: onboarding_documents. Everyone in the tenant can read (they need to
-- see what they're accepting); only owner/office manage them — enforced in
-- the server action (getTenantContext + role check), matching the settings/
-- team pattern elsewhere in this codebase rather than a second role check
-- inside RLS.
REVOKE ALL ON TABLE public.onboarding_documents FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.onboarding_documents TO authenticated;
ALTER TABLE public.onboarding_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_documents_select_same_tenant"
  ON public.onboarding_documents;
CREATE POLICY "onboarding_documents_select_same_tenant"
  ON public.onboarding_documents
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "onboarding_documents_insert_same_tenant"
  ON public.onboarding_documents;
CREATE POLICY "onboarding_documents_insert_same_tenant"
  ON public.onboarding_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "onboarding_documents_update_same_tenant"
  ON public.onboarding_documents;
CREATE POLICY "onboarding_documents_update_same_tenant"
  ON public.onboarding_documents
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- RLS: staff_acceptances. A user can see/insert only their own acceptance
-- rows; owner/office read the tenant's full picture via the same SELECT
-- policy (tenant-scoped), which also covers "who has/hasn't signed".
REVOKE ALL ON TABLE public.staff_acceptances FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.staff_acceptances TO authenticated;
ALTER TABLE public.staff_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_acceptances_select_same_tenant"
  ON public.staff_acceptances;
CREATE POLICY "staff_acceptances_select_same_tenant"
  ON public.staff_acceptances
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "staff_acceptances_insert_own"
  ON public.staff_acceptances;
CREATE POLICY "staff_acceptances_insert_own"
  ON public.staff_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
    AND user_id = auth.uid()
  );
