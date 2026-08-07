-- Email marketing: templates, campaigns, and a per-recipient send ledger.
-- Individually-sent (one row per recipient, one Resend call per recipient —
-- see src/actions/email-marketing.ts), not a bulk multi-recipient blast.
--
-- COMPLIANCE NOTE: client-facing sends require opt-in (GDPR). This
-- migration adds the opt-in columns and the app enforces opt-in at
-- send-time (see getOptedInClientRecipients in the actions file), but
-- there is deliberately no unsubscribe-link / suppression-list automation
-- yet — do not send real marketing email to real clients until that's
-- built and reviewed. See Trade Stack - Email Marketing.md for the open
-- items.
--
-- Requires public.current_user_tenant_id() (fix_users_rls / 20260205120000).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS marketing_opted_in_at timestamptz;

CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  created_by_id uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_templates_tenant_id_idx
  ON public.email_templates (tenant_id);

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  template_id uuid NOT NULL REFERENCES public.email_templates(id),
  audience text NOT NULL CHECK (audience IN ('staff', 'clients')),
  sent_by_id uuid REFERENCES public.users(id),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_campaigns_tenant_id_idx
  ON public.email_campaigns (tenant_id);

CREATE TABLE IF NOT EXISTS public.email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id),
  recipient_email text NOT NULL,
  recipient_name text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_sends_tenant_id_idx ON public.email_sends (tenant_id);
CREATE INDEX IF NOT EXISTS email_sends_campaign_id_idx ON public.email_sends (campaign_id);

-- RLS: email_templates
REVOKE ALL ON TABLE public.email_templates FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.email_templates TO authenticated;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_templates_select_same_tenant" ON public.email_templates;
CREATE POLICY "email_templates_select_same_tenant"
  ON public.email_templates
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "email_templates_insert_same_tenant" ON public.email_templates;
CREATE POLICY "email_templates_insert_same_tenant"
  ON public.email_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "email_templates_update_same_tenant" ON public.email_templates;
CREATE POLICY "email_templates_update_same_tenant"
  ON public.email_templates
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- RLS: email_campaigns
REVOKE ALL ON TABLE public.email_campaigns FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.email_campaigns TO authenticated;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_campaigns_select_same_tenant" ON public.email_campaigns;
CREATE POLICY "email_campaigns_select_same_tenant"
  ON public.email_campaigns
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "email_campaigns_insert_same_tenant" ON public.email_campaigns;
CREATE POLICY "email_campaigns_insert_same_tenant"
  ON public.email_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "email_campaigns_update_same_tenant" ON public.email_campaigns;
CREATE POLICY "email_campaigns_update_same_tenant"
  ON public.email_campaigns
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- RLS: email_sends (append-only ledger)
REVOKE ALL ON TABLE public.email_sends FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.email_sends TO authenticated;
ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_sends_select_same_tenant" ON public.email_sends;
CREATE POLICY "email_sends_select_same_tenant"
  ON public.email_sends
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "email_sends_insert_same_tenant" ON public.email_sends;
CREATE POLICY "email_sends_insert_same_tenant"
  ON public.email_sends
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "email_sends_update_same_tenant" ON public.email_sends;
CREATE POLICY "email_sends_update_same_tenant"
  ON public.email_sends
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());
