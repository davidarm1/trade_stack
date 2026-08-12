-- Phase 2 actor/membership schema checks.
--
-- These assertions verify the additive membership columns for the remaining
-- tenant-scoped actor tables. The write-path behavior is covered separately in
-- app tests and the phase 1 membership RLS acceptance file.

BEGIN;

DO $$
DECLARE
  missing_count int;
BEGIN
  WITH required(table_name, column_name) AS (
    VALUES
      ('jobs', 'created_by_membership_id'),
      ('jobs', 'approved_by_membership_id'),
      ('jobs', 'assigned_engineer_membership_id'),
      ('job_completions', 'engineer_membership_id'),
      ('job_images', 'uploaded_by_membership_id'),
      ('job_invoice_versions', 'created_by_membership_id'),
      ('quotes', 'created_by_membership_id'),
      ('quotes', 'assigned_engineer_membership_id'),
      ('receipts', 'uploaded_by_membership_id'),
      ('timesheets', 'membership_id'),
      ('timesheets', 'approved_by_membership_id'),
      ('wages', 'membership_id'),
      ('wages', 'approved_by_membership_id'),
      ('vehicles', 'assigned_membership_id'),
      ('vehicle_maintenance_log', 'created_by_membership_id'),
      ('van_stock', 'last_checked_by_membership_id'),
      ('onboarding_documents', 'created_by_membership_id'),
      ('staff_acceptances', 'membership_id'),
      ('mobile_access_tokens', 'membership_id'),
      ('mobile_access_tokens', 'created_by_membership_id'),
      ('audit_log', 'membership_id'),
      ('stock_movements', 'membership_id'),
      ('email_templates', 'created_by_membership_id'),
      ('email_campaigns', 'sent_by_membership_id')
  )
  SELECT COUNT(*)
  INTO missing_count
  FROM required r
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = r.table_name
   AND c.column_name = r.column_name
  WHERE c.column_name IS NULL;

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Phase 2 schema check failed: missing membership actor columns';
  END IF;
END
$$;

DO $$
DECLARE
  leftover_count int;
BEGIN
  WITH removed(table_name, column_name) AS (
    VALUES
      ('jobs', 'created_by_id'),
      ('jobs', 'approved_by_id'),
      ('jobs', 'assigned_engineer_id'),
      ('job_completions', 'engineer_id'),
      ('job_images', 'uploaded_by_id'),
      ('job_invoice_versions', 'created_by_id'),
      ('quotes', 'created_by_id'),
      ('quotes', 'assigned_engineer_id'),
      ('receipts', 'uploaded_by_id'),
      ('timesheets', 'user_id'),
      ('timesheets', 'approved_by_id'),
      ('wages', 'user_id'),
      ('wages', 'approved_by_id'),
      ('vehicles', 'assigned_user_id'),
      ('vehicle_maintenance_log', 'created_by_id'),
      ('van_stock', 'last_checked_by_id'),
      ('onboarding_documents', 'created_by_id'),
      ('staff_acceptances', 'user_id'),
      ('mobile_access_tokens', 'user_id'),
      ('mobile_access_tokens', 'created_by_id'),
      ('audit_log', 'user_id'),
      ('stock_movements', 'user_id'),
      ('email_templates', 'created_by_id'),
      ('email_campaigns', 'sent_by_id')
  )
  SELECT COUNT(*)
  INTO leftover_count
  FROM removed r
  JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = r.table_name
   AND c.column_name = r.column_name;

  IF leftover_count > 0 THEN
    RAISE EXCEPTION 'Phase 2 schema check failed: legacy actor columns still present';
  END IF;
END
$$;

DO $$
DECLARE
  fn_count int;
BEGIN
  SELECT COUNT(*)
  INTO fn_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('membership_id_for_company_user', 'current_user_membership_id');

  IF fn_count < 2 THEN
    RAISE EXCEPTION 'Phase 2 schema check failed: membership helper functions missing';
  END IF;
END
$$;

ROLLBACK;
