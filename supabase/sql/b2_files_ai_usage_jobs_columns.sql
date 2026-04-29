-- =============================================================================
-- One-file manual run for Trade Stack (Supabase SQL Editor).
-- Same as migrations:
--   20260412160000_tenant_files.sql
--   20260412160100_ai_usage.sql
--   20260412160200_jobs_b2_file_urls.sql
--
-- Receipt / expense scanning: use existing public.receipts (no outgoings table).
-- =============================================================================

-- File metadata for B2 uploads (jobsheets, signatures, receipts, invoices).
-- Requires public.current_user_tenant_id() and public.current_user_role() (see prior migrations).

CREATE TABLE public.tenant_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs (id) ON DELETE SET NULL,
  file_type text,
  b2_key text NOT NULL,
  file_name text,
  file_size_bytes bigint,
  public_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX tenant_files_tenant_id_idx ON public.tenant_files (tenant_id);

CREATE INDEX tenant_files_job_id_idx ON public.tenant_files (job_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.tenant_files IS
  'Uploaded files (Backblaze B2). file_type: jobsheet | invoice | receipt | signature';

COMMENT ON COLUMN public.tenant_files.file_type IS
  'jobsheet | invoice | receipt | signature';

REVOKE ALL ON TABLE public.tenant_files FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_files TO authenticated;

ALTER TABLE public.tenant_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_files_select_same_tenant" ON public.tenant_files;
CREATE POLICY "tenant_files_select_same_tenant"
  ON public.tenant_files
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS "tenant_files_insert_by_job_access" ON public.tenant_files;
CREATE POLICY "tenant_files_insert_by_job_access"
  ON public.tenant_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (
      job_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id = tenant_files.job_id
          AND j.tenant_id = tenant_files.tenant_id
          AND j.deleted_at IS NULL
          AND (
            public.current_user_role() IN ('owner', 'office', 'viewer')
            OR (
              public.current_user_role() = 'engineer'
              AND j.assigned_engineer_id = auth.uid()
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS "tenant_files_update_same_tenant" ON public.tenant_files;
CREATE POLICY "tenant_files_update_same_tenant"
  ON public.tenant_files
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

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

-- Columns for B2 public URLs from generate-jobsheet / save-signature APIs.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS jobsheet_url text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS signature_url text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS signed_at timestamptz;

COMMENT ON COLUMN public.jobs.jobsheet_url IS 'Public URL of generated job sheet PDF (Backblaze B2).';
COMMENT ON COLUMN public.jobs.signature_url IS 'Public URL of client signature image (Backblaze B2).';
COMMENT ON COLUMN public.jobs.signed_at IS 'When the client signature was captured.';
