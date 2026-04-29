CREATE OR REPLACE FUNCTION public.insert_audit_log(
  p_tenant_id uuid,
  p_user_id uuid,
  p_event text,
  p_ip text,
  p_user_agent text,
  p_metadata jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.audit_log
    (tenant_id, user_id, event, ip, user_agent, metadata)
  VALUES
    (p_tenant_id, p_user_id, p_event, p_ip, p_user_agent, p_metadata);
END;
$$;
