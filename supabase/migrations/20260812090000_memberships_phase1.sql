-- Phase 1: separate global identity from tenant employment by introducing
-- memberships plus spell history. This migration is additive-only so it can be
-- deployed safely before the later policy/query cutover.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'membership_status'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.membership_status AS ENUM (
      'invited',
      'active',
      'suspended',
      'leaver'
    );
  END IF;
END
$$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS theme text,
  ADD COLUMN IF NOT EXISTS active_company_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'employee';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_account_type_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_account_type_check
      CHECK (account_type IN ('employee', 'freelancer', 'platform_staff'));
  END IF;
END
$$;

UPDATE public.users
SET active_company_id = COALESCE(active_company_id, tenant_id)
WHERE active_company_id IS NULL;

CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  role text NOT NULL,
  status public.membership_status NOT NULL DEFAULT 'invited',
  display_name text,
  job_title text,
  employee_ref text,
  work_phone text,
  concurrent_allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.memberships IS
  'One person employed by one company. Global identity stays on public.users; tenant-scoped employment data lives here.';
COMMENT ON COLUMN public.memberships.user_id IS
  'Auth user for this person. ON DELETE RESTRICT keeps employment history if the auth account is removed.';
COMMENT ON COLUMN public.memberships.company_id IS
  'Tenant/company this employment belongs to. Keep the old tenant_id columns elsewhere until the final cutover.';
COMMENT ON COLUMN public.memberships.concurrent_allowed IS
  'Freelancer-style multi-tenant access. Set only by platform staff once the account_type on public.users permits it.';

CREATE TABLE IF NOT EXISTS public.membership_spells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.memberships (id) ON DELETE RESTRICT,
  joined_at timestamptz NOT NULL,
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.membership_spells IS
  'Employment spell history for a membership. Rehire/reactivation creates a new spell instead of overwriting dates.';

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships (id) ON DELETE SET NULL;
ALTER TABLE public.mobile_access_tokens
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships (id) ON DELETE SET NULL;
ALTER TABLE public.staff_acceptances
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships (id) ON DELETE SET NULL;
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships (id) ON DELETE SET NULL;

UPDATE public.audit_log al
SET membership_id = m.id
FROM public.memberships m
WHERE al.membership_id IS NULL
  AND al.user_id = m.user_id
  AND al.tenant_id = m.company_id;

UPDATE public.mobile_access_tokens mat
SET membership_id = m.id
FROM public.memberships m
WHERE mat.membership_id IS NULL
  AND mat.user_id = m.user_id
  AND mat.tenant_id = m.company_id;

UPDATE public.staff_acceptances sa
SET membership_id = m.id
FROM public.memberships m
WHERE sa.membership_id IS NULL
  AND sa.user_id = m.user_id
  AND sa.tenant_id = m.company_id;

UPDATE public.stock_movements sm
SET membership_id = m.id
FROM public.memberships m
WHERE sm.membership_id IS NULL
  AND sm.user_id = m.user_id
  AND sm.tenant_id = m.company_id;

CREATE INDEX IF NOT EXISTS audit_log_membership_id_idx
  ON public.audit_log (membership_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mobile_access_tokens_membership_id_idx
  ON public.mobile_access_tokens (membership_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staff_acceptances_membership_id_idx
  ON public.staff_acceptances (membership_id);
CREATE INDEX IF NOT EXISTS stock_movements_membership_id_idx
  ON public.stock_movements (membership_id);

CREATE UNIQUE INDEX IF NOT EXISTS memberships_user_company_key
  ON public.memberships (user_id, company_id);

CREATE UNIQUE INDEX IF NOT EXISTS memberships_one_live_non_concurrent_idx
  ON public.memberships (user_id)
  WHERE status IN ('active', 'invited')
    AND NOT concurrent_allowed;

CREATE INDEX IF NOT EXISTS memberships_company_status_idx
  ON public.memberships (company_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS memberships_user_status_idx
  ON public.memberships (user_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS membership_spells_open_spell_idx
  ON public.membership_spells (membership_id)
  WHERE left_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS membership_spells_membership_joined_key
  ON public.membership_spells (membership_id, joined_at);

CREATE INDEX IF NOT EXISTS membership_spells_membership_joined_desc_idx
  ON public.membership_spells (membership_id, joined_at DESC);

INSERT INTO public.memberships (
  user_id,
  company_id,
  role,
  status,
  display_name,
  job_title,
  employee_ref,
  work_phone,
  concurrent_allowed,
  created_at,
  updated_at
)
SELECT
  u.id,
  u.tenant_id,
  COALESCE(u.role::text, 'viewer'),
  CASE
    WHEN u.leaver_at IS NOT NULL THEN 'leaver'::public.membership_status
    WHEN u.is_active THEN 'active'::public.membership_status
    ELSE 'suspended'::public.membership_status
  END,
  u.name,
  NULL,
  NULL,
  COALESCE(u.phone, u.company_phone),
  COALESCE(u.account_type = 'freelancer', false),
  u.created_at,
  u.updated_at
FROM public.users u
ON CONFLICT (user_id, company_id) DO UPDATE
SET
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  display_name = EXCLUDED.display_name,
  job_title = EXCLUDED.job_title,
  work_phone = EXCLUDED.work_phone,
  concurrent_allowed = EXCLUDED.concurrent_allowed,
  updated_at = now();

INSERT INTO public.membership_spells (
  membership_id,
  joined_at,
  left_at,
  created_at,
  updated_at
)
SELECT
  m.id,
  u.created_at,
  u.leaver_at,
  u.created_at,
  u.updated_at
FROM public.memberships m
JOIN public.users u
  ON u.id = m.user_id
 AND u.tenant_id = m.company_id
ON CONFLICT (membership_id, joined_at) DO NOTHING;

UPDATE public.memberships m
SET concurrent_allowed = true
WHERE EXISTS (
  SELECT 1
  FROM public.users u
  WHERE u.id = m.user_id
    AND u.account_type = 'freelancer'
)
  AND m.concurrent_allowed = false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'membership_spells_joined_before_left_check'
      AND conrelid = 'public.membership_spells'::regclass
  ) THEN
    ALTER TABLE public.membership_spells
      ADD CONSTRAINT membership_spells_joined_before_left_check
      CHECK (left_at IS NULL OR left_at >= joined_at);
  END IF;
END $$;

