-- Backfill memberships for existing users so membership-scoped job assignment can see
-- staff that already appear on the team page.
--
-- This migration is idempotent and safe to re-run.

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
WHERE u.tenant_id IS NOT NULL
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
WHERE NOT EXISTS (
  SELECT 1
  FROM public.membership_spells ms
  WHERE ms.membership_id = m.id
)
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
