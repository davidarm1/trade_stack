-- Fix duplicate job_number on insert (e.g. quote → job) when soft-deleted rows
-- still hold numbers: unique index idx_jobs_job_number applies to all rows, but
-- next_job_number() previously used MAX(...) only for deleted_at IS NULL, so it
-- could return a number already taken by a deleted job.

CREATE OR REPLACE FUNCTION public.next_job_number(tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(tenant_id::text));

  SELECT COALESCE(MAX(j.job_number), 0) + 1
  INTO n
  FROM public.jobs j
  WHERE j.tenant_id = next_job_number.tenant_id;
  -- Include soft-deleted rows so we never reuse a job_number that still exists.

  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.next_job_number(uuid) IS
  'Returns next job_number for tenant (max job_number across all rows + 1). SECURITY DEFINER; advisory lock avoids races.';
