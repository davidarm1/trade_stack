-- Enforce jobs workflow integrity:
-- if sent_to_engineer_at is set, assigned_engineer_id must be set.
--
-- Backfill strategy before adding the CHECK:
-- 1) If possible, copy engineer from the latest job completion row.
-- 2) For any remaining inconsistent rows, clear sent/received timestamps.

WITH latest_completion_engineer AS (
  SELECT DISTINCT ON (jc.job_id)
    jc.job_id,
    jc.tenant_id,
    jc.engineer_id
  FROM public.job_completions jc
  WHERE jc.engineer_id IS NOT NULL
  ORDER BY jc.job_id, jc.submitted_at DESC NULLS LAST, jc.id DESC
)
UPDATE public.jobs j
SET
  assigned_engineer_id = lce.engineer_id,
  updated_at = NOW()
FROM latest_completion_engineer lce
WHERE j.id = lce.job_id
  AND j.tenant_id = lce.tenant_id
  AND j.sent_to_engineer_at IS NOT NULL
  AND j.assigned_engineer_id IS NULL;

UPDATE public.jobs
SET
  sent_to_engineer_at = NULL,
  received_from_engineer_at = NULL,
  updated_at = NOW()
WHERE sent_to_engineer_at IS NOT NULL
  AND assigned_engineer_id IS NULL;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_sent_requires_assigned_engineer;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_sent_requires_assigned_engineer
  CHECK (sent_to_engineer_at IS NULL OR assigned_engineer_id IS NOT NULL);
