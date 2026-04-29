-- Run in Supabase SQL Editor if you did not apply migrations (same as 20260417140000).

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
  -- Include soft-deleted rows: unique (tenant_id, job_number) still reserves those numbers.

  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.next_job_number(uuid) IS
  'Next job_number for tenant (max + 1).';

REVOKE ALL ON FUNCTION public.next_job_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_job_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_job_number(uuid) TO service_role;
