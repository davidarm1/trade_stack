-- Phase 2: migrate remaining tenant-scoped actor columns to membership_id.
--
-- Canonical membership migration for a fresh go-live schema: add membership
-- actor columns, backfill them from the existing seed data, and prepare the
-- tables for dropping the old user-keyed actor columns in the cleanup step.

CREATE OR REPLACE FUNCTION public.membership_id_for_company_user(
  p_user_id uuid,
  p_company_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id
  FROM public.memberships m
  WHERE m.user_id = p_user_id
    AND m.company_id = p_company_id
  ORDER BY m.updated_at DESC, m.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.membership_id_for_company_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.membership_id_for_company_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.membership_id_for_company_user(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.membership_id_for_company_user(uuid, uuid) IS
  'Resolves the membership row for a user within a company; used to backfill actor membership columns.';

-- Jobs and related workflow rows ------------------------------------------------
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS created_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_engineer_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.jobs j
SET created_by_membership_id = public.membership_id_for_company_user(j.created_by_id, j.tenant_id)
WHERE j.created_by_membership_id IS NULL
  AND j.created_by_id IS NOT NULL;

UPDATE public.jobs j
SET approved_by_membership_id = public.membership_id_for_company_user(j.approved_by_id, j.tenant_id)
WHERE j.approved_by_membership_id IS NULL
  AND j.approved_by_id IS NOT NULL;

UPDATE public.jobs j
SET assigned_engineer_membership_id = public.membership_id_for_company_user(j.assigned_engineer_id, j.tenant_id)
WHERE j.assigned_engineer_membership_id IS NULL
  AND j.assigned_engineer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS jobs_created_by_membership_id_idx
  ON public.jobs (tenant_id, created_by_membership_id);

CREATE INDEX IF NOT EXISTS jobs_approved_by_membership_id_idx
  ON public.jobs (tenant_id, approved_by_membership_id);

CREATE INDEX IF NOT EXISTS jobs_assigned_engineer_membership_id_idx
  ON public.jobs (tenant_id, assigned_engineer_membership_id);

ALTER TABLE public.job_completions
  ADD COLUMN IF NOT EXISTS engineer_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.job_completions jc
SET engineer_membership_id = public.membership_id_for_company_user(jc.engineer_id, jc.tenant_id)
WHERE jc.engineer_membership_id IS NULL
  AND jc.engineer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_completions_engineer_membership_id_idx
  ON public.job_completions (tenant_id, engineer_membership_id);

ALTER TABLE public.job_images
  ADD COLUMN IF NOT EXISTS uploaded_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.job_images ji
SET uploaded_by_membership_id = public.membership_id_for_company_user(ji.uploaded_by_id, ji.tenant_id)
WHERE ji.uploaded_by_membership_id IS NULL
  AND ji.uploaded_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_images_uploaded_by_membership_id_idx
  ON public.job_images (tenant_id, uploaded_by_membership_id);

ALTER TABLE public.job_invoice_versions
  ADD COLUMN IF NOT EXISTS created_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.job_invoice_versions jiv
SET created_by_membership_id = public.membership_id_for_company_user(jiv.created_by_id, jiv.tenant_id)
WHERE jiv.created_by_membership_id IS NULL
  AND jiv.created_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_invoice_versions_created_by_membership_id_idx
  ON public.job_invoice_versions (tenant_id, created_by_membership_id);

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS created_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_engineer_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.quotes q
SET created_by_membership_id = public.membership_id_for_company_user(q.created_by_id, q.tenant_id)
WHERE q.created_by_membership_id IS NULL
  AND q.created_by_id IS NOT NULL;

UPDATE public.quotes q
SET assigned_engineer_membership_id = public.membership_id_for_company_user(q.assigned_engineer_id, q.tenant_id)
WHERE q.assigned_engineer_membership_id IS NULL
  AND q.assigned_engineer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quotes_created_by_membership_id_idx
  ON public.quotes (tenant_id, created_by_membership_id);

CREATE INDEX IF NOT EXISTS quotes_assigned_engineer_membership_id_idx
  ON public.quotes (tenant_id, assigned_engineer_membership_id);

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS uploaded_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.receipts r
SET uploaded_by_membership_id = public.membership_id_for_company_user(r.uploaded_by_id, r.tenant_id)
WHERE r.uploaded_by_membership_id IS NULL
  AND r.uploaded_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS receipts_uploaded_by_membership_id_idx
  ON public.receipts (tenant_id, uploaded_by_membership_id);

ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.timesheets t
SET membership_id = public.membership_id_for_company_user(t.user_id, t.tenant_id)
WHERE t.membership_id IS NULL
  AND t.user_id IS NOT NULL;

UPDATE public.timesheets t
SET approved_by_membership_id = public.membership_id_for_company_user(t.approved_by_id, t.tenant_id)
WHERE t.approved_by_membership_id IS NULL
  AND t.approved_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS timesheets_membership_id_idx
  ON public.timesheets (tenant_id, membership_id);

CREATE INDEX IF NOT EXISTS timesheets_approved_by_membership_id_idx
  ON public.timesheets (tenant_id, approved_by_membership_id);

ALTER TABLE public.wages
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.wages w
SET membership_id = public.membership_id_for_company_user(w.user_id, w.tenant_id)
WHERE w.membership_id IS NULL
  AND w.user_id IS NOT NULL;

UPDATE public.wages w
SET approved_by_membership_id = public.membership_id_for_company_user(w.approved_by_id, w.tenant_id)
WHERE w.approved_by_membership_id IS NULL
  AND w.approved_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wages_membership_id_idx
  ON public.wages (tenant_id, membership_id);

CREATE INDEX IF NOT EXISTS wages_approved_by_membership_id_idx
  ON public.wages (tenant_id, approved_by_membership_id);

-- Vans / fleet -----------------------------------------------------------------
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS assigned_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.vehicles v
SET assigned_membership_id = public.membership_id_for_company_user(v.assigned_user_id, v.tenant_id)
WHERE v.assigned_membership_id IS NULL
  AND v.assigned_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS vehicles_assigned_membership_id_idx
  ON public.vehicles (tenant_id, assigned_membership_id);

ALTER TABLE public.vehicle_maintenance_log
  ADD COLUMN IF NOT EXISTS created_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.vehicle_maintenance_log vml
SET created_by_membership_id = public.membership_id_for_company_user(vml.created_by_id, vml.tenant_id)
WHERE vml.created_by_membership_id IS NULL
  AND vml.created_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS vehicle_maintenance_log_created_by_membership_id_idx
  ON public.vehicle_maintenance_log (tenant_id, created_by_membership_id);

ALTER TABLE public.van_stock
  ADD COLUMN IF NOT EXISTS last_checked_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.van_stock vs
SET last_checked_by_membership_id = public.membership_id_for_company_user(vs.last_checked_by_id, vs.tenant_id)
WHERE vs.last_checked_by_membership_id IS NULL
  AND vs.last_checked_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS van_stock_last_checked_by_membership_id_idx
  ON public.van_stock (tenant_id, last_checked_by_membership_id);

-- Onboarding / mobile auth -----------------------------------------------------
ALTER TABLE public.onboarding_documents
  ADD COLUMN IF NOT EXISTS created_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.onboarding_documents od
SET created_by_membership_id = public.membership_id_for_company_user(od.created_by_id, od.tenant_id)
WHERE od.created_by_membership_id IS NULL
  AND od.created_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS onboarding_documents_created_by_membership_id_idx
  ON public.onboarding_documents (tenant_id, created_by_membership_id);

ALTER TABLE public.staff_acceptances
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.staff_acceptances sa
SET membership_id = public.membership_id_for_company_user(sa.user_id, sa.tenant_id)
WHERE sa.membership_id IS NULL
  AND sa.user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS staff_acceptances_membership_id_idx
  ON public.staff_acceptances (tenant_id, membership_id);

ALTER TABLE public.mobile_access_tokens
  ADD COLUMN IF NOT EXISTS created_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.mobile_access_tokens mat
SET created_by_membership_id = public.membership_id_for_company_user(mat.created_by_id, mat.tenant_id)
WHERE mat.created_by_membership_id IS NULL
  AND mat.created_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mobile_access_tokens_created_by_membership_id_idx
  ON public.mobile_access_tokens (tenant_id, created_by_membership_id);

-- Audit / marketing / stock ----------------------------------------------------
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.audit_log al
SET membership_id = public.membership_id_for_company_user(al.user_id, al.tenant_id)
WHERE al.membership_id IS NULL
  AND al.user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_log_membership_id_idx
  ON public.audit_log (tenant_id, membership_id);

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.stock_movements sm
SET membership_id = public.membership_id_for_company_user(sm.user_id, sm.tenant_id)
WHERE sm.membership_id IS NULL
  AND sm.user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_movements_membership_id_idx
  ON public.stock_movements (tenant_id, membership_id);

ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS created_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

UPDATE public.email_templates et
SET created_by_membership_id = public.membership_id_for_company_user(et.created_by_id, et.tenant_id)
WHERE et.created_by_membership_id IS NULL
  AND et.created_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_templates_created_by_membership_id_idx
  ON public.email_templates (tenant_id, created_by_membership_id);

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS sent_by_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_campaigns'
      AND column_name = 'sent_by_id'
  ) THEN
    EXECUTE 'UPDATE public.email_campaigns ec
             SET sent_by_membership_id = public.membership_id_for_company_user(ec.sent_by_id, ec.tenant_id)
             WHERE ec.sent_by_membership_id IS NULL
               AND ec.sent_by_id IS NOT NULL;';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_campaigns_sent_by_membership_id_idx
  ON public.email_campaigns (tenant_id, sent_by_membership_id);

-- Receipts already carry tenant-scoped actor metadata for uploads. Keep the
-- legacy user_id columns until the write paths have been migrated.

COMMENT ON COLUMN public.jobs.created_by_membership_id IS
  'Backfilled from jobs.created_by_id. Future writes should record the actor membership directly.';
COMMENT ON COLUMN public.jobs.approved_by_membership_id IS
  'Backfilled from jobs.approved_by_id. Future writes should record the actor membership directly.';
COMMENT ON COLUMN public.jobs.assigned_engineer_membership_id IS
  'Backfilled from jobs.assigned_engineer_id. Future writes should record the assigned membership directly.';
COMMENT ON COLUMN public.job_completions.engineer_membership_id IS
  'Backfilled from job_completions.engineer_id. Future writes should record the engineer membership directly.';
COMMENT ON COLUMN public.job_images.uploaded_by_membership_id IS
  'Backfilled from job_images.uploaded_by_id. Future writes should record the uploader membership directly.';
COMMENT ON COLUMN public.job_invoice_versions.created_by_membership_id IS
  'Backfilled from job_invoice_versions.created_by_id. Future writes should record the actor membership directly.';
COMMENT ON COLUMN public.quotes.created_by_membership_id IS
  'Backfilled from quotes.created_by_id. Future writes should record the actor membership directly.';
COMMENT ON COLUMN public.quotes.assigned_engineer_membership_id IS
  'Backfilled from quotes.assigned_engineer_id. Future writes should record the assigned membership directly.';
COMMENT ON COLUMN public.receipts.uploaded_by_membership_id IS
  'Backfilled from receipts.uploaded_by_id. Future writes should record the uploader membership directly.';
COMMENT ON COLUMN public.timesheets.membership_id IS
  'Backfilled from timesheets.user_id. Future writes should record the worker membership directly.';
COMMENT ON COLUMN public.timesheets.approved_by_membership_id IS
  'Backfilled from timesheets.approved_by_id. Future writes should record the approver membership directly.';
COMMENT ON COLUMN public.wages.membership_id IS
  'Backfilled from wages.user_id. Future writes should record the worker membership directly.';
COMMENT ON COLUMN public.wages.approved_by_membership_id IS
  'Backfilled from wages.approved_by_id. Future writes should record the approver membership directly.';
COMMENT ON COLUMN public.vehicles.assigned_membership_id IS
  'Backfilled from vehicles.assigned_user_id. Future writes should record the assignee membership directly.';
COMMENT ON COLUMN public.vehicle_maintenance_log.created_by_membership_id IS
  'Backfilled from vehicle_maintenance_log.created_by_id. Future writes should record the actor membership directly.';
COMMENT ON COLUMN public.van_stock.last_checked_by_membership_id IS
  'Backfilled from van_stock.last_checked_by_id. Future writes should record the checker membership directly.';
COMMENT ON COLUMN public.onboarding_documents.created_by_membership_id IS
  'Backfilled from onboarding_documents.created_by_id. Future writes should record the actor membership directly.';
COMMENT ON COLUMN public.staff_acceptances.membership_id IS
  'Backfilled from staff_acceptances.user_id. This records the member who accepted the document.';
COMMENT ON COLUMN public.mobile_access_tokens.membership_id IS
  'Backfilled from mobile_access_tokens.user_id. Future writes should record the token holder membership directly.';
COMMENT ON COLUMN public.mobile_access_tokens.created_by_membership_id IS
  'Backfilled from mobile_access_tokens.created_by_id. Future writes should record the creator membership directly.';
COMMENT ON COLUMN public.audit_log.membership_id IS
  'Backfilled from audit_log.user_id. Future writes should record the actor membership directly.';
COMMENT ON COLUMN public.stock_movements.membership_id IS
  'Backfilled from stock_movements.user_id. Future writes should record the actor membership directly.';
COMMENT ON COLUMN public.email_templates.created_by_membership_id IS
  'Backfilled from email_templates.created_by_id. Future writes should record the actor membership directly.';
COMMENT ON COLUMN public.email_campaigns.sent_by_membership_id IS
  'Backfilled from email_campaigns.sent_by_id. Future writes should record the sender membership directly.';
