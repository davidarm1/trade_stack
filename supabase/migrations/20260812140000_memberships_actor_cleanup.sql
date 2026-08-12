-- Destructive cleanup: remove legacy user-keyed actor columns from the
-- membership-migrated tables now that membership_id-based columns exist.

ALTER TABLE public.jobs
  DROP COLUMN IF EXISTS created_by_id,
  DROP COLUMN IF EXISTS approved_by_id,
  DROP COLUMN IF EXISTS assigned_engineer_id;

ALTER TABLE public.job_completions
  DROP COLUMN IF EXISTS engineer_id;

ALTER TABLE public.job_images
  DROP COLUMN IF EXISTS uploaded_by_id;

ALTER TABLE public.job_invoice_versions
  DROP COLUMN IF EXISTS created_by_id;

ALTER TABLE public.quotes
  DROP COLUMN IF EXISTS created_by_id,
  DROP COLUMN IF EXISTS assigned_engineer_id;

ALTER TABLE public.receipts
  DROP COLUMN IF EXISTS uploaded_by_id;

ALTER TABLE public.timesheets
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS approved_by_id;

ALTER TABLE public.wages
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS approved_by_id;

ALTER TABLE public.vehicles
  DROP COLUMN IF EXISTS assigned_user_id;

ALTER TABLE public.vehicle_maintenance_log
  DROP COLUMN IF EXISTS created_by_id;

ALTER TABLE public.van_stock
  DROP COLUMN IF EXISTS last_checked_by_id;

ALTER TABLE public.onboarding_documents
  DROP COLUMN IF EXISTS created_by_id;

ALTER TABLE public.staff_acceptances
  DROP COLUMN IF EXISTS user_id;

ALTER TABLE public.mobile_access_tokens
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS created_by_id;

ALTER TABLE public.audit_log
  DROP COLUMN IF EXISTS user_id;

ALTER TABLE public.stock_movements
  DROP COLUMN IF EXISTS user_id;

ALTER TABLE public.email_templates
  DROP COLUMN IF EXISTS created_by_id;

ALTER TABLE public.email_campaigns
  DROP COLUMN IF EXISTS sent_by_id;
