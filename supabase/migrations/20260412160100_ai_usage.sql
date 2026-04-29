-- OpenAI token / cost logging (e.g. job_parse, receipt_scan).

CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  feature text NOT NULL,
  model text,
  prompt_tokens int,
  completion_tokens int,
  total_tokens int,
  cost_usd numeric(10, 6),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_tenant_id_created_at_idx
  ON public.ai_usage (tenant_id, created_at DESC);

COMMENT ON TABLE public.ai_usage IS 'Per-request AI usage for billing / observability.';
COMMENT ON COLUMN public.ai_usage.feature IS 'job_parse | receipt_scan | ...';

REVOKE ALL ON TABLE public.ai_usage FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.ai_usage TO authenticated;

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_select_same_tenant" ON public.ai_usage;
CREATE POLICY "ai_usage_select_same_tenant"
  ON public.ai_usage
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS "ai_usage_insert_same_tenant" ON public.ai_usage;
CREATE POLICY "ai_usage_insert_same_tenant"
  ON public.ai_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.current_user_tenant_id());
