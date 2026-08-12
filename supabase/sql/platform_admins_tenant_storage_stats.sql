-- Standalone copy of the platform-admin foundation migration.
-- Prefer applying via supabase/migrations/20260721220000_platform_admins_tenant_storage_stats.sql.
--
-- Manual step required after applying: insert the operator's own auth
-- user id into public.platform_admins.
--
-- Example (replace with the real auth.users id):
--   INSERT INTO public.platform_admins (user_id)
--   VALUES ('00000000-0000-0000-0000-000000000000')
--   ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins
  DROP CONSTRAINT IF EXISTS platform_admins_user_id_fkey;
ALTER TABLE public.platform_admins
  ADD CONSTRAINT platform_admins_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users (id)
  ON DELETE RESTRICT;

COMMENT ON TABLE public.platform_admins IS
  'Explicit allowlist for platform-owner access to the admin console.';
COMMENT ON COLUMN public.platform_admins.user_id IS
  'Insert the platform owner auth.users id manually after migration.';

REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC;
GRANT SELECT ON TABLE public.platform_admins TO service_role;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.tenant_storage_stats (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants (id) ON DELETE CASCADE,
  total_bytes bigint NOT NULL DEFAULT 0,
  object_count int NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_storage_stats IS
  'Operator-computed Backblaze B2 storage totals per tenant.';
COMMENT ON COLUMN public.tenant_storage_stats.computed_at IS
  'Point-in-time timestamp set by the admin refresh job.';

REVOKE ALL ON TABLE public.tenant_storage_stats FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_storage_stats TO service_role;

ALTER TABLE public.tenant_storage_stats ENABLE ROW LEVEL SECURITY;
