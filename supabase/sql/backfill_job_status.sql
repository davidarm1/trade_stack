-- =============================================================================
-- Backfill public.jobs.status from workflow timestamps (HydroScot import fix)
-- Tenant: c551f0d4-c039-4a19-8aa8-9e1078c18b6b
--
-- Context: the import mapped legacy JobStatus text into jobs.status, but the
-- old plugin treated "open" vs done using Approve / invoice / paid columns.
-- Those columns became approved_at, invoice_sent_at, invoice_paid_at, etc.
--
-- Run in Supabase SQL editor as service_role (bypasses RLS).
-- Do NOT run against production without reviewing; wraps in BEGIN/COMMIT.
--
-- public.job_status allows ONLY:
--   open | in_progress | scheduled | completed | cancelled | invoiced
-- (There is no 'paid' or 'approved' — paid is invoice_paid_at + payment fields;
--  office approval in the app sets status = completed.)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- STEP 0 — approved_at missing despite office approval email in staging
--
-- At import, approved_by_id was NULL when Approve (email) did not match a
-- user row; ApproveTimeStamp still records when the office approved.
-- (Edge-case count from pre-check: 4 rows for this tenant.)
-- ---------------------------------------------------------------------------

UPDATE public.jobs j
SET
  approved_at = s."ApproveTimeStamp"::timestamptz,
  updated_at  = NOW()
FROM public.staging_jobs s
WHERE j.tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
  AND j.legacy_ref = s."Id"::text
  AND j.deleted_at IS NULL
  AND s."Approve"::text LIKE '%@%'
  AND j.approved_at IS NULL
  AND NOT (COALESCE(s."ApproveTimeStamp"::text, '') ~ '^0000|^$|^NULL$');

-- ---------------------------------------------------------------------------
-- STEP 1 — Derive status from timestamps (most progressed wins).
--
-- Aligns with Trade Stack behaviour:
--   - invoiced: invoice sent (includes paid jobs; no separate enum 'paid')
--   - completed: office approved (approved_at set)
--   - in_progress: sent to engineer and/or returned from engineer, not yet
--                  invoiced and not office-approved
--   - open: nothing started yet
--
-- Rows already status = cancelled are left unchanged.
-- ---------------------------------------------------------------------------

UPDATE public.jobs j
SET
  status = v.new_status,
  updated_at = NOW()
FROM (
  SELECT
    j2.id,
    CASE
      WHEN j2.invoice_sent_at IS NOT NULL OR j2.invoice_paid_at IS NOT NULL
        THEN 'invoiced'::public.job_status
      WHEN j2.approved_at IS NOT NULL
        THEN 'completed'::public.job_status
      WHEN j2.received_from_engineer_at IS NOT NULL
        THEN 'in_progress'::public.job_status
      WHEN j2.sent_to_engineer_at IS NOT NULL
        THEN 'in_progress'::public.job_status
      ELSE 'open'::public.job_status
    END AS new_status
  FROM public.jobs j2
  WHERE j2.tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
    AND j2.deleted_at IS NULL
    AND j2.status IS DISTINCT FROM 'cancelled'::public.job_status
) v
WHERE j.id = v.id
  AND j.tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
  AND j.status IS DISTINCT FROM v.new_status;

-- ---------------------------------------------------------------------------
-- VERIFICATION — expect ~1 row with status = open for this import.
-- ---------------------------------------------------------------------------

SELECT status, COUNT(*) AS n
FROM public.jobs
WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
  AND deleted_at IS NULL
GROUP BY status
ORDER BY status;

COMMIT;
