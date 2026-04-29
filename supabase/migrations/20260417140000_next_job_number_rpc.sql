-- Per-tenant monotonic job_number for new jobs (create job, quote → job).
-- Called from the app: supabase.rpc('next_job_number', { tenant_id: '<uuid>' }).

CREATE OR REPLACE FUNCTION public.next_job_number(tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  -- Serialize allocation per tenant for concurrent creates.
  PERFORM pg_advisory_xact_lock(hashtext(tenant_id::text));

  SELECT COALESCE(MAX(j.job_number), 0) + 1
  INTO n
  FROM public.jobs j
  WHERE j.tenant_id = next_job_number.tenant_id;
  -- Include soft-deleted rows: unique (tenant_id, job_number) still reserves those numbers.

  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.next_job_number(uuid) IS
  'Returns next job_number for tenant (max job_number across all rows + 1). SECURITY DEFINER; advisory lock avoids races.';

REVOKE ALL ON FUNCTION public.next_job_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_job_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_job_number(uuid) TO service_role;
