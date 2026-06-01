-- =============================================================================
-- HydroScot: staging_jobs → live tables
-- Tenant: c551f0d4-c039-4a19-8aa8-9e1078c18b6b
-- Run in Supabase SQL editor as service_role (bypasses RLS)
--
-- IMPORTANT — column casing in staging_jobs:
--   This script quotes column names using the exact MySQL mixed-case headers
--   (e.g. "CompanyName", "JobTitle"). If your CSV import lowercased them all,
--   do a global find-and-replace on the quoted names before running.
--   Quick check: SELECT column_name FROM information_schema.columns
--                WHERE table_name = 'staging_jobs' ORDER BY ordinal_position;
--
-- What this script does:
--   Phase 1 – DELETE all existing HydroScot rows from job-related tables
--   Phase 2 – INSERT deduplicated clients
--   Phase 3 – INSERT jobs (legacy_ref = original MySQL Id)
--             The jobs_log_invoice_send_trigger fires automatically here and
--             populates job_invoice_send_log for any row with invoice_sent_at set.
--   Phase 4 – INSERT job_completions (rows with engineer field data)
--   Phase 5 – INSERT job_materials (split Price_of_materials on '#')
--   Phase 6 – INSERT job_images (image1_file .. image5_file)
--   Phase 7 – Second-pass UPDATE to resolve SubJobMasterId → parent_job_id
-- =============================================================================

BEGIN;

-- ===========================================================================
-- PHASE 1 — Delete existing HydroScot job-related data (FK-safe order)
-- ===========================================================================

-- Explicit child-table deletes in case FK constraints do not cascade
DELETE FROM public.job_images
  WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b';

DELETE FROM public.job_materials
  WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b';

DELETE FROM public.job_completions
  WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b';

DELETE FROM public.job_invoice_versions
  WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b';

-- job_invoice_send_log cascades from jobs; delete explicitly first so no stale
-- rows remain if the cascade fires on the DELETE FROM jobs below.
DELETE FROM public.job_invoice_send_log
  WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b';

-- quotes.booked_job_id → jobs.id has no cascade; null it out first
UPDATE public.quotes
SET    booked_job_id = NULL
WHERE  tenant_id     = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
  AND  booked_job_id IS NOT NULL;

DELETE FROM public.jobs
  WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b';

-- quotes.client_id → clients.id has no cascade; null it out first
UPDATE public.quotes
SET    client_id = NULL
WHERE  tenant_id  = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
  AND  client_id IS NOT NULL;

DELETE FROM public.clients
  WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b';

-- ===========================================================================
-- PHASE 2 — Insert deduplicated clients
-- One client row per distinct CompanyName; picks the highest-Id (most recent)
-- row per company to source address/contact fields.
-- ===========================================================================

INSERT INTO public.clients (
  id,
  tenant_id,
  company_name,
  address1,
  address2,
  town,
  postcode,
  contact_name,
  contact_email,
  contact_number,
  is_active,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'::uuid,
  s."CompanyName",
  NULLIF(TRIM(s."Address1"::text),      ''),
  NULLIF(TRIM(s."Address2"::text),      ''),
  NULLIF(TRIM(s."Town"::text),          ''),
  NULLIF(TRIM(s."Postcode"::text),      ''),
  NULLIF(TRIM(s."ContactName"::text),   ''),
  NULLIF(TRIM(s."ContactEmail"::text),  ''),
  NULLIF(TRIM(s."ContactNumber"::text), ''),
  true,
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT ON (s2."CompanyName") s2.*
  FROM   public.staging_jobs s2
  WHERE  TRIM(COALESCE(s2."CompanyName"::text, '')) <> ''
  ORDER  BY s2."CompanyName", s2."Id"::integer DESC
) s;

-- ===========================================================================
-- PHASE 3 — Insert jobs
--
-- Key mappings:
--   legacy_ref        = original MySQL Id (used as join key in later phases)
--   import_job_number = same as legacy_ref (audit trail)
--   job_number        = sequential 1..N ordered by original Id (all prior
--                       HydroScot jobs were deleted above so MAX starts at 0)
--
-- Zero/null-date guard: COALESCE(col::text, '') ~ '^0000|^$|^NULL$'
--   matches '0000-00-00 00:00:00', '', and NULL → returns NULL
--
-- invoice_sent_at trigger: jobs_log_invoice_send_trigger fires AFTER INSERT
--   and auto-populates job_invoice_send_log for rows where invoice_sent_at IS
--   NOT NULL — no manual insert needed.
-- ===========================================================================

INSERT INTO public.jobs (
  id,
  tenant_id,
  client_id,
  title,
  description,
  status,
  job_type,
  assigned_engineer_id,
  allocated_at,
  sent_to_engineer_at,
  received_from_engineer_at,
  approved_at,
  approved_by_id,
  invoice_sent_at,
  invoice_sent_to_email,
  invoice_paid_at,
  payment_status,
  sent_to_debt_collection_at,
  labour_charge,
  total_materials,
  subtotal,
  vat_rate,
  vat_amount,
  total_inc_vat,
  remove_vat,
  payment_terms_days,
  client_order_number,
  custom_invoice_number,
  custom_po_number,
  site_address1,
  site_address2,
  site_town,
  site_postcode,
  date_onsite,
  time_onsite,
  notes,
  overdue_comment,
  invoice_source,
  new_work_request,
  signature_url,
  jobsheet_url,
  signed_at,
  parent_job_id,
  legacy_ref,
  import_job_number,
  job_number,
  deleted_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'::uuid,

  -- client lookup by company name
  (SELECT c.id FROM public.clients c
   WHERE  c.tenant_id   = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
     AND  c.company_name = s."CompanyName"
   LIMIT  1),

  NULLIF(TRIM(s."JobTitle"::text),       ''),
  NULLIF(TRIM(s."JobDescription"::text), ''),
  -- Map old MySQL JobStatus text → job_status enum.
  -- Run: SELECT DISTINCT "JobStatus" FROM staging_jobs; to verify all values are covered.
  (CASE LOWER(TRIM(COALESCE(s."JobStatus"::text, '')))
    WHEN 'open'         THEN 'open'
    WHEN 'in progress'  THEN 'in_progress'
    WHEN 'in_progress'  THEN 'in_progress'
    WHEN 'inprogress'   THEN 'in_progress'
    WHEN 'scheduled'    THEN 'scheduled'
    WHEN 'completed'    THEN 'completed'
    WHEN 'complete'     THEN 'completed'
    WHEN 'cancelled'    THEN 'cancelled'
    WHEN 'canceled'     THEN 'cancelled'
    WHEN 'invoiced'     THEN 'invoiced'
    WHEN 'invoice sent' THEN 'invoiced'
    WHEN 'paid'         THEN 'invoiced'
    ELSE                     'open'
  END)::public.job_status,
  -- Job_Type: column is NOT NULL so we fall back to the first valid enum value.
  -- After import: SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.job_type'::regtype;
  -- Then UPDATE jobs SET job_type = '<correct_value>' WHERE legacy_ref IN (SELECT "Id"::text FROM staging_jobs WHERE "Job_Type" = <n>);
  (SELECT e.enumlabel::public.job_type
   FROM   pg_enum e
   WHERE  e.enumtypid = 'public.job_type'::regtype
   ORDER  BY e.enumsortorder LIMIT 1),

  -- engineer: email address in old system → UUID lookup
  (SELECT u.id FROM public.users u
   WHERE  u.tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
     AND  u.email     = NULLIF(TRIM(s."Engineer"::text), '')
   LIMIT  1),

  -- allocated_at: best proxy is SentToEngineerTimeStamp
  CASE WHEN COALESCE(s."SentToEngineerTimeStamp"::text, '') ~ '^0000|^$|^NULL$'
       THEN NULL
       ELSE s."SentToEngineerTimeStamp"::timestamptz END,

  CASE WHEN COALESCE(s."SentToEngineerTimeStamp"::text, '') ~ '^0000|^$|^NULL$'
       THEN NULL
       ELSE s."SentToEngineerTimeStamp"::timestamptz END,

  CASE WHEN COALESCE(s."ReceivedfromEngineerTimeStamp"::text, '') ~ '^0000|^$|^NULL$'
       THEN NULL
       ELSE s."ReceivedfromEngineerTimeStamp"::timestamptz END,

  CASE WHEN COALESCE(s."ApproveTimeStamp"::text, '') ~ '^0000|^$|^NULL$'
       THEN NULL
       ELSE s."ApproveTimeStamp"::timestamptz END,

  -- Approve column stores approver email address or '0' (not approved)
  CASE WHEN COALESCE(s."Approve"::text, '0') IN ('0', '')
       THEN NULL
       ELSE (SELECT u.id FROM public.users u
             WHERE  u.tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
               AND  u.email     = s."Approve"::text
             LIMIT  1)
  END,

  CASE WHEN COALESCE(s."invoiceEmailedToClient"::text, '') ~ '^0000|^$|^NULL$'
       THEN NULL
       ELSE s."invoiceEmailedToClient"::timestamptz END,

  NULLIF(TRIM(s."Email_Sent_To"::text), ''),

  CASE WHEN COALESCE(s."InvoicePaid"::text, '') ~ '^0000|^$|^NULL$'
       THEN NULL
       ELSE s."InvoicePaid"::timestamptz END,

  -- payment_status: NOT NULL enum; app derives paid/overdue dynamically from timestamps.
  -- After import: SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.payment_status'::regtype;
  (SELECT e.enumlabel::public.payment_status
   FROM   pg_enum e
   WHERE  e.enumtypid = 'public.payment_status'::regtype
   ORDER  BY e.enumsortorder LIMIT 1),

  -- sent_to_debt_collection_at: MySQL stores 0/1 with no timestamp;
  -- use the job Date as a rough proxy when flag is set.
  CASE WHEN COALESCE(s."sent_to_debt_collection"::text, '0') = '1'
       THEN CASE WHEN COALESCE(s."Date"::text, '') ~ '^0000|^$|^NULL$'
                 THEN NOW()
                 ELSE s."Date"::timestamptz END
       ELSE NULL
  END,

  COALESCE(NULLIF(NULLIF(s."Labour_Charge"::text,            'NULL'), '')::numeric, 0),
  COALESCE(NULLIF(NULLIF(s."Total_Price_of_materials"::text, 'NULL'), '')::numeric, 0),
  COALESCE(NULLIF(NULLIF(s."Total_No_VAT"::text,             'NULL'), '')::numeric, 0),
  COALESCE((SELECT t.default_vat_rate FROM public.tenants t
            WHERE  t.id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b' LIMIT 1),
           0),  -- vat_rate: not in old data; uses tenant default_vat_rate or 0
  COALESCE(NULLIF(NULLIF(s."VAT"::text,                      'NULL'), '')::numeric, 0),
  COALESCE(NULLIF(NULLIF(s."Total"::text,                    'NULL'), '')::numeric, 0),

  -- remove_vat: MySQL INT (0/1) → boolean
  (COALESCE(NULLIF(s."remove_vat"::text, 'NULL'), '0') IN ('1', 'true', 't')),

  -- Payment_Terms_In_Days: MySQL VARCHAR DEFAULT '30'; NOT NULL in Supabase
  COALESCE(
    NULLIF(NULLIF(NULLIF(s."Payment_Terms_In_Days"::text, 'NULL'), ''), '0')::integer,
    (SELECT t.default_payment_terms_days FROM public.tenants t
     WHERE  t.id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b' LIMIT 1),
    30
  ),

  NULLIF(TRIM(s."clientOrderNumber"::text),     ''),
  NULLIF(TRIM(s."custom_invoice_number"::text), ''),
  NULLIF(TRIM(s."custom_po_number"::text),      ''),

  NULLIF(TRIM(s."site_address1"::text), ''),
  NULLIF(TRIM(s."site_address2"::text), ''),
  NULLIF(TRIM(s."site_town"::text),     ''),
  NULLIF(TRIM(s."site_postcode"::text), ''),

  CASE WHEN COALESCE(s."date_onsite"::text, '') ~ '^0000|^$|^NULL$'
       THEN NULL
       ELSE s."date_onsite"::date END,

  CASE WHEN COALESCE(s."time_onsite"::text, '') ~ '^$|^NULL$'
       THEN NULL
       ELSE s."time_onsite"::time END,

  NULLIF(TRIM(s."Story_Time"::text),      ''),
  NULLIF(TRIM(s."Overdue_Comment"::text), ''),
  -- invoice_source: NOT NULL enum; map old Invoice_From text where possible, else first enum value.
  -- After import: SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.invoice_source'::regtype;
  COALESCE(
    CASE WHEN NULLIF(TRIM(s."Invoice_From"::text), '') IS NOT NULL
         THEN (SELECT e.enumlabel::public.invoice_source
               FROM   pg_enum e
               WHERE  e.enumtypid  = 'public.invoice_source'::regtype
                 AND  e.enumlabel  = LOWER(TRIM(s."Invoice_From"::text))
               LIMIT  1)
         ELSE NULL END,
    (SELECT e.enumlabel::public.invoice_source
     FROM   pg_enum e
     WHERE  e.enumtypid = 'public.invoice_source'::regtype
     ORDER  BY e.enumsortorder LIMIT 1)
  ),

  -- new_work_request: Supabase boolean flag; true when engineer wrote new-work notes
  (TRIM(COALESCE(s."eng_New_Work_Request"::text, '')) <> ''),

  -- signature_url / jobsheet_url: store filename; full B2 URL needs post-import update
  -- (B2 bucket: hydroscot-files, prefix: signatures/ and jobsheets/)
  NULLIF(TRIM(s."photo_signature_name"::text), ''),
  NULLIF(TRIM(s."job_sheet_image"::text),      ''),

  -- signed_at: when client signed on-site (proxy: ReceivedfromEngineerTimeStamp)
  CASE WHEN TRIM(COALESCE(s."photo_signature_name"::text, '')) <> ''
            AND COALESCE(s."ReceivedfromEngineerTimeStamp"::text, '') !~ '^0000|^$|^NULL$'
       THEN s."ReceivedfromEngineerTimeStamp"::timestamptz
       ELSE NULL
  END,

  NULL,  -- parent_job_id: set in Phase 7 via second-pass UPDATE

  s."Id"::text,   -- legacy_ref
  s."Id"::text,   -- import_job_number
  ROW_NUMBER() OVER (ORDER BY s."Id"::integer),  -- job_number: 1-based sequential

  -- deleted_at: MySQL deleted_records INT (1 = soft-deleted)
  -- Note: original deletion timestamp not available; uses NOW() as placeholder.
  CASE WHEN COALESCE(s."deleted_records"::text, '0') = '1' THEN NOW() ELSE NULL END,

  CASE WHEN COALESCE(s."Date"::text, '') ~ '^0000|^$|^NULL$'
       THEN NOW()
       ELSE s."Date"::timestamptz END,
  NOW()

FROM public.staging_jobs s;
-- Add WHERE clause if staging_jobs holds data for multiple tenants:
-- WHERE s.tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'

-- ===========================================================================
-- PHASE 4 — Insert job_completions
-- Only for rows that have at least one engineer field populated.
-- eng_New_Work_Request (text notes about new work) → recommendations column.
-- ===========================================================================

INSERT INTO public.job_completions (
  id,
  tenant_id,
  job_id,
  engineer_id,
  work_carried_out,
  parts_used,
  recommendations,
  date_completed,
  start_time,
  finish_time,
  client_print_name,
  client_signature_url,
  submitted_at
)
SELECT
  gen_random_uuid(),
  'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'::uuid,
  j.id,
  -- engineer_id NOT NULL: email lookup → job's assigned_engineer_id → first owner/engineer
  COALESCE(
    (SELECT u.id FROM public.users u
     WHERE  u.tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
       AND  u.email     = NULLIF(TRIM(s."Engineer"::text), '')
     LIMIT  1),
    j.assigned_engineer_id,
    (SELECT u.id FROM public.users u
     WHERE  u.tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
       AND  u.role IN ('owner', 'engineer')
       AND  u.is_active = true
     ORDER  BY u.role DESC  -- 'owner' before 'engineer'
     LIMIT  1)
  ),
  NULLIF(TRIM(s."eng_Work_Carried_Out"::text),  ''),
  NULLIF(TRIM(s."eng_Parts_Used"::text),         ''),
  NULLIF(TRIM(s."eng_New_Work_Request"::text),   ''),
  CASE WHEN COALESCE(s."eng_Date_Job_Completed"::text, '') ~ '^0000|^$|^NULL$'
       THEN NULL
       ELSE s."eng_Date_Job_Completed"::date END,
  CASE WHEN COALESCE(s."eng_Job_Start_Time"::text, '') ~ '^$|^NULL$'
       THEN NULL
       ELSE s."eng_Job_Start_Time"::time END,
  CASE WHEN COALESCE(s."eng_Finish_Time"::text, '') ~ '^$|^NULL$'
       THEN NULL
       ELSE s."eng_Finish_Time"::time END,
  NULLIF(TRIM(s."print_name"::text),            ''),
  NULLIF(TRIM(s."photo_signature_name"::text),  ''),
  -- submitted_at NOT NULL; fall back to eng_Date_Job_Completed then NOW()
  COALESCE(
    CASE WHEN COALESCE(s."ReceivedfromEngineerTimeStamp"::text, '') ~ '^0000|^$|^NULL$'
         THEN NULL ELSE s."ReceivedfromEngineerTimeStamp"::timestamptz END,
    CASE WHEN COALESCE(s."eng_Date_Job_Completed"::text, '') ~ '^0000|^$|^NULL$'
         THEN NULL ELSE s."eng_Date_Job_Completed"::date::timestamptz END,
    NOW()
  )
FROM public.staging_jobs s
JOIN public.jobs j
  ON  j.legacy_ref = s."Id"::text
  AND j.tenant_id  = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
WHERE
     TRIM(COALESCE(s."eng_Work_Carried_Out"::text,  '')) <> ''
  OR TRIM(COALESCE(s."eng_Parts_Used"::text,         '')) <> ''
  OR TRIM(COALESCE(s."print_name"::text,             '')) <> ''
  OR TRIM(COALESCE(s."photo_signature_name"::text,   '')) <> ''
  OR COALESCE(s."eng_Date_Job_Completed"::text, '') NOT IN ('', '0000-00-00', '0000-00-00 00:00:00');

-- ===========================================================================
-- PHASE 5 — Insert job_materials
-- Price_of_materials uses '#' as a line delimiter. Split and insert one row
-- per non-empty segment. Individual quantities/prices were not tracked in the
-- old system; description only. Aggregate total is on jobs.total_materials.
-- ===========================================================================

INSERT INTO public.job_materials (
  id,
  tenant_id,
  job_id,
  description,
  quantity,
  unit_price,
  sort_order,
  created_at
)
SELECT
  gen_random_uuid(),
  'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'::uuid,
  j.id,
  TRIM(mat.line),
  1,     -- quantity NOT NULL; old system stored no per-line qty, default to 1
  0,     -- unit_price NOT NULL; old system had no per-line price, default to 0
  mat.ord::integer,
  NOW()
FROM public.staging_jobs s
JOIN public.jobs j
  ON  j.legacy_ref = s."Id"::text
  AND j.tenant_id  = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
JOIN LATERAL (
  SELECT TRIM(item) AS line, ordinality AS ord
  FROM   unnest(string_to_array(s."Price_of_materials"::text, '#'))
         WITH ORDINALITY AS t(item, ordinality)
  WHERE  TRIM(item) <> ''
) mat ON TRUE
WHERE TRIM(COALESCE(s."Price_of_materials"::text, '')) <> '';

-- ===========================================================================
-- PHASE 6 — Insert job_images (image1_file .. image5_file)
-- Stores filenames; full B2 URL: https://f005.backblazeb2.com/file/hydroscot-files/photos/<filename>
-- A post-import UPDATE can prepend the URL prefix once confirmed.
-- ===========================================================================

INSERT INTO public.job_images (
  id,
  tenant_id,
  job_id,
  image_url,
  image_name,
  image_type,
  uploaded_by_id,
  uploaded_at
)
SELECT
  gen_random_uuid(),
  'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'::uuid,
  j.id,
  img.filename,
  img.filename,
  'photo',
  (SELECT u.id FROM public.users u
   WHERE  u.tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
     AND  u.email     = NULLIF(TRIM(s."Engineer"::text), '')
   LIMIT  1),
  CASE WHEN COALESCE(s."ReceivedfromEngineerTimeStamp"::text, '') ~ '^0000|^$|^NULL$'
       THEN NOW()
       ELSE s."ReceivedfromEngineerTimeStamp"::timestamptz END
FROM public.staging_jobs s
JOIN public.jobs j
  ON  j.legacy_ref = s."Id"::text
  AND j.tenant_id  = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
JOIN LATERAL (
  VALUES
    (NULLIF(TRIM(s."image1_file"::text), '')),
    (NULLIF(TRIM(s."image2_file"::text), '')),
    (NULLIF(TRIM(s."image3_file"::text), '')),
    (NULLIF(TRIM(s."image4_file"::text), '')),
    (NULLIF(TRIM(s."image5_file"::text), ''))
) AS img(filename) ON img.filename IS NOT NULL;

-- ===========================================================================
-- PHASE 7 — Second-pass: resolve SubJobMasterId → parent_job_id
-- SubJobMasterId = 0 means no parent; non-zero = MySQL Id of parent job.
-- ===========================================================================

UPDATE public.jobs AS target
SET
  parent_job_id = parent.id,
  updated_at    = NOW()
FROM   public.staging_jobs s
JOIN   public.jobs parent
       ON  parent.legacy_ref = s."SubJobMasterId"::text
       AND parent.tenant_id  = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
WHERE  target.legacy_ref = s."Id"::text
  AND  target.tenant_id  = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
  AND  COALESCE(s."SubJobMasterId"::text, '0') NOT IN ('0', '');

COMMIT;

-- =============================================================================
-- POST-IMPORT VERIFICATION — run these separately after the COMMIT above
-- =============================================================================

/*
-- Row counts
SELECT 'clients'              AS tbl, COUNT(*) FROM public.clients             WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
UNION ALL
SELECT 'jobs',                         COUNT(*) FROM public.jobs                WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
UNION ALL
SELECT 'job_completions',              COUNT(*) FROM public.job_completions     WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
UNION ALL
SELECT 'job_materials',                COUNT(*) FROM public.job_materials       WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
UNION ALL
SELECT 'job_images',                   COUNT(*) FROM public.job_images          WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
UNION ALL
SELECT 'job_invoice_send_log',         COUNT(*) FROM public.job_invoice_send_log WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
UNION ALL
SELECT 'jobs with parent_job_id set',  COUNT(*) FROM public.jobs               WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b' AND parent_job_id IS NOT NULL;

-- Engineers from staging_jobs that did not match a users row (will have NULL assigned_engineer_id)
SELECT s."Engineer", COUNT(*) AS job_count
FROM public.staging_jobs s
LEFT JOIN public.users u
  ON  u.email     = s."Engineer"
  AND u.tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
WHERE TRIM(COALESCE(s."Engineer"::text, '')) <> ''
  AND u.id IS NULL
GROUP BY s."Engineer"
ORDER BY job_count DESC;

-- Approvers that did not match a users row
SELECT s."Approve", COUNT(*) AS job_count
FROM public.staging_jobs s
LEFT JOIN public.users u
  ON  u.email     = s."Approve"
  AND u.tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
WHERE COALESCE(s."Approve"::text, '0') NOT IN ('0', '')
  AND u.id IS NULL
GROUP BY s."Approve"
ORDER BY job_count DESC;

-- Jobs with NULL client_id (company name not matched)
SELECT s."CompanyName", COUNT(*)
FROM public.staging_jobs s
JOIN public.jobs j ON j.legacy_ref = s."Id"::text AND j.tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
WHERE j.client_id IS NULL
GROUP BY s."CompanyName";

-- job_number range check
SELECT MIN(job_number), MAX(job_number), COUNT(*) FROM public.jobs
WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b';
*/

-- =============================================================================
-- POST-IMPORT: Prepend B2 URLs (run after verifying filenames are correct)
-- =============================================================================

/*
-- Signatures (jobs.signature_url)
UPDATE public.jobs
SET signature_url = 'https://f005.backblazeb2.com/file/hydroscot-files/signatures/' || signature_url
WHERE tenant_id   = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
  AND signature_url IS NOT NULL
  AND signature_url NOT LIKE 'http%';

-- Job sheets (jobs.jobsheet_url)
UPDATE public.jobs
SET jobsheet_url = 'https://f005.backblazeb2.com/file/hydroscot-files/jobsheets/' || jobsheet_url
WHERE tenant_id  = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
  AND jobsheet_url IS NOT NULL
  AND jobsheet_url NOT LIKE 'http%';

-- Signatures in job_completions
UPDATE public.job_completions jc
SET client_signature_url = 'https://f005.backblazeb2.com/file/hydroscot-files/signatures/' || jc.client_signature_url
WHERE jc.tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
  AND jc.client_signature_url IS NOT NULL
  AND jc.client_signature_url NOT LIKE 'http%';

-- Job images
UPDATE public.job_images
SET image_url  = 'https://f005.backblazeb2.com/file/hydroscot-files/photos/' || image_url,
    image_name = image_name   -- unchanged
WHERE tenant_id = 'c551f0d4-c039-4a19-8aa8-9e1078c18b6b'
  AND image_url NOT LIKE 'http%';
*/
