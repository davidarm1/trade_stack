-- Fix for a table-name collision discovered 2026-08-12: this project's
-- Supabase database already has email_templates / email_campaigns /
-- email_sends tables (plus email_lists / email_subscribers) belonging to
-- some other, unidentified system — a mailing-list model with
-- subscriber_id/list_id/tracking_token/opened_at/clicked_at/bounced_at,
-- nothing like the template_id/audience/recipient_email shape this
-- feature needs. Origin unknown; not created by this codebase or this
-- migration set. All confirmed empty (0 rows) before this migration, but
-- left completely untouched regardless — not dropped, not altered, not
-- renamed. This creates fresh, distinctly-named tables instead so there's
-- no ambiguity about which system owns which table going forward.
--
-- Supersedes 20260806110000_email_marketing.sql's email_templates /
-- email_campaigns / email_sends CREATE TABLE statements — those three
-- table names should be treated as belonging to the other system now,
-- not to Trade Stack. The clients.marketing_opt_in /
-- marketing_opted_in_at columns from that migration are unaffected (they
-- live on the genuine `clients` table) and don't need repeating here.
--
-- Requires public.current_user_tenant_id() (fix_users_rls / 20260205120000).

CREATE TABLE IF NOT EXISTS public.trade_stack_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  created_by_id uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_stack_email_templates_tenant_id_idx
  ON public.trade_stack_email_templates (tenant_id);

CREATE TABLE IF NOT EXISTS public.trade_stack_email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  template_id uuid NOT NULL REFERENCES public.trade_stack_email_templates(id),
  audience text NOT NULL CHECK (audience IN ('staff', 'clients')),
  sent_by_id uuid REFERENCES public.users(id),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_stack_email_campaigns_tenant_id_idx
  ON public.trade_stack_email_campaigns (tenant_id);

CREATE TABLE IF NOT EXISTS public.trade_stack_email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  campaign_id uuid NOT NULL REFERENCES public.trade_stack_email_campaigns(id),
  recipient_email text NOT NULL,
  recipient_name text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_stack_email_sends_tenant_id_idx
  ON public.trade_stack_email_sends (tenant_id);
CREATE INDEX IF NOT EXISTS trade_stack_email_sends_campaign_id_idx
  ON public.trade_stack_email_sends (campaign_id);

-- RLS: trade_stack_email_templates
REVOKE ALL ON TABLE public.trade_stack_email_templates FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.trade_stack_email_templates TO authenticated;
ALTER TABLE public.trade_stack_email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trade_stack_email_templates_select_same_tenant" ON public.trade_stack_email_templates;
CREATE POLICY "trade_stack_email_templates_select_same_tenant"
  ON public.trade_stack_email_templates
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "trade_stack_email_templates_insert_same_tenant" ON public.trade_stack_email_templates;
CREATE POLICY "trade_stack_email_templates_insert_same_tenant"
  ON public.trade_stack_email_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "trade_stack_email_templates_update_same_tenant" ON public.trade_stack_email_templates;
CREATE POLICY "trade_stack_email_templates_update_same_tenant"
  ON public.trade_stack_email_templates
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- RLS: trade_stack_email_campaigns
REVOKE ALL ON TABLE public.trade_stack_email_campaigns FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.trade_stack_email_campaigns TO authenticated;
ALTER TABLE public.trade_stack_email_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trade_stack_email_campaigns_select_same_tenant" ON public.trade_stack_email_campaigns;
CREATE POLICY "trade_stack_email_campaigns_select_same_tenant"
  ON public.trade_stack_email_campaigns
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "trade_stack_email_campaigns_insert_same_tenant" ON public.trade_stack_email_campaigns;
CREATE POLICY "trade_stack_email_campaigns_insert_same_tenant"
  ON public.trade_stack_email_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "trade_stack_email_campaigns_update_same_tenant" ON public.trade_stack_email_campaigns;
CREATE POLICY "trade_stack_email_campaigns_update_same_tenant"
  ON public.trade_stack_email_campaigns
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- RLS: trade_stack_email_sends (append-only ledger)
REVOKE ALL ON TABLE public.trade_stack_email_sends FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.trade_stack_email_sends TO authenticated;
ALTER TABLE public.trade_stack_email_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trade_stack_email_sends_select_same_tenant" ON public.trade_stack_email_sends;
CREATE POLICY "trade_stack_email_sends_select_same_tenant"
  ON public.trade_stack_email_sends
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "trade_stack_email_sends_insert_same_tenant" ON public.trade_stack_email_sends;
CREATE POLICY "trade_stack_email_sends_insert_same_tenant"
  ON public.trade_stack_email_sends
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS "trade_stack_email_sends_update_same_tenant" ON public.trade_stack_email_sends;
CREATE POLICY "trade_stack_email_sends_update_same_tenant"
  ON public.trade_stack_email_sends
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

NOTIFY pgrst, 'reload schema';
