-- Phase 1 membership acceptance checks.
--
-- Run this against a migrated database in a privileged SQL session.
-- Each scenario uses a transaction and rolls back so no fixture rows remain.

BEGIN;

DO $$
DECLARE
  tenant_a uuid := '11111111-1111-1111-1111-111111111111';
  tenant_b uuid := '22222222-2222-2222-2222-222222222222';
  tenant_c uuid := '33333333-3333-3333-3333-333333333333';
  user_id uuid := '44444444-4444-4444-4444-444444444444';
  membership_a uuid := '55555555-5555-5555-5555-555555555555';
  membership_b uuid := '66666666-6666-6666-6666-666666666666';
  membership_c uuid := '77777777-7777-7777-7777-777777777777';
  job_a uuid := '88888888-8888-8888-8888-888888888888';
  job_b uuid := '99999999-9999-9999-9999-999999999999';
  created_at timestamptz := now();
  active_tenant uuid;
  row_count int;
  job_count int;
  spell_count int;
  open_spell_count int;
BEGIN
  -- Fixtures: one user, three company memberships, and one job per visible tenant.
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    'phase1-memberships@example.test',
    'x',
    created_at,
    '{}'::jsonb,
    '{}'::jsonb,
    created_at,
    created_at
  );

  INSERT INTO public.tenants (id, name, slug, is_active, created_at, updated_at)
  VALUES
    (tenant_a, 'Tenant A', 'tenant-a', true, created_at, created_at),
    (tenant_b, 'Tenant B', 'tenant-b', true, created_at, created_at),
    (tenant_c, 'Tenant C', 'tenant-c', true, created_at, created_at);

  INSERT INTO public.users (
    id,
    tenant_id,
    name,
    email,
    phone,
    role,
    work_contract_type,
    charge_rate,
    hourly_rate,
    travel_rate,
    company_phone,
    approver1_id,
    approver2_id,
    is_active,
    leaver_at,
    avatar_url,
    locale,
    theme,
    active_company_id,
    account_type,
    created_at,
    updated_at
  ) VALUES (
    user_id,
    tenant_a,
    'Phase One Tester',
    'phase1-memberships@example.test',
    NULL,
    'owner',
    'employed',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    true,
    NULL,
    NULL,
    NULL,
    NULL,
    tenant_c,
    'freelancer',
    created_at,
    created_at
  );

  INSERT INTO public.memberships (
    id,
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
  ) VALUES
    (
      membership_a,
      user_id,
      tenant_a,
      'owner',
      'active',
      'Phase One Tester',
      'Lead Engineer',
      'EMP-A',
      '07111111111',
      true,
      created_at,
      created_at
    ),
    (
      membership_b,
      user_id,
      tenant_b,
      'office',
      'active',
      'Phase One Tester',
      'Office',
      'EMP-B',
      '07222222222',
      true,
      created_at,
      created_at
    ),
    (
      membership_c,
      user_id,
      tenant_c,
      'owner',
      'active',
      'Phase One Tester',
      'Freelancer',
      'EMP-C',
      '07333333333',
      true,
      created_at,
      created_at
    );

  INSERT INTO public.membership_spells (
    id,
    membership_id,
    joined_at,
    left_at,
    created_at,
    updated_at
  ) VALUES
    (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      membership_a,
      created_at - interval '30 days',
      NULL,
      created_at,
      created_at
    ),
    (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
      membership_b,
      created_at - interval '30 days',
      NULL,
      created_at,
      created_at
    ),
    (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
      membership_c,
      created_at - interval '30 days',
      NULL,
      created_at,
      created_at
    );

  INSERT INTO public.jobs (
    id,
    tenant_id,
    title,
    status,
    assigned_engineer_id,
    created_by_id,
    created_at,
    updated_at
  ) VALUES
    (
      job_a,
      tenant_a,
      'Tenant A job',
      'open',
      user_id,
      user_id,
      created_at,
      created_at
    ),
    (
      job_b,
      tenant_b,
      'Tenant B job',
      'open',
      user_id,
      user_id,
      created_at,
      created_at
    );

  -- Switch to the same auth identity the app would use.
  PERFORM set_config('request.jwt.claim.sub', user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Scenario 1: fresh active membership in Tenant C sees an empty job list.
  UPDATE public.users
  SET tenant_id = tenant_c,
      updated_at = created_at
  WHERE id = user_id;

  SELECT public.current_user_tenant_id() INTO active_tenant;
  IF active_tenant IS DISTINCT FROM tenant_c THEN
    RAISE EXCEPTION 'Expected current tenant C, got %', active_tenant;
  END IF;

  SELECT count(*) INTO job_count
  FROM public.jobs;
  IF job_count <> 0 THEN
    RAISE EXCEPTION 'Expected empty job list for tenant C, got % rows', job_count;
  END IF;

  -- Scenario 2: leaver at Tenant A + active membership at Tenant B.
  UPDATE public.memberships
  SET status = 'leaver',
      updated_at = created_at
  WHERE id = membership_a;

  UPDATE public.membership_spells
  SET left_at = created_at + interval '1 day',
      updated_at = created_at + interval '1 day'
  WHERE membership_id = membership_a
    AND left_at IS NULL;

  UPDATE public.users
  SET tenant_id = tenant_b,
      leaver_at = created_at + interval '1 day',
      updated_at = created_at + interval '1 day'
  WHERE id = user_id;

  SELECT public.current_user_tenant_id() INTO active_tenant;
  IF active_tenant IS DISTINCT FROM tenant_b THEN
    RAISE EXCEPTION 'Expected current tenant B after leaver switch, got %', active_tenant;
  END IF;

  SELECT count(*) INTO job_count
  FROM public.jobs
  WHERE tenant_id = tenant_a;
  IF job_count <> 0 THEN
    RAISE EXCEPTION 'Expected zero Tenant A rows while tenant B is active, got %', job_count;
  END IF;

  SELECT count(*) INTO job_count
  FROM public.jobs
  WHERE tenant_id = tenant_b;
  IF job_count <> 1 THEN
    RAISE EXCEPTION 'Expected one visible Tenant B row, got %', job_count;
  END IF;

  UPDATE public.jobs
  SET title = 'blocked update'
  WHERE tenant_id = tenant_a;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 0 THEN
    RAISE EXCEPTION 'Expected zero Tenant A rows updated while tenant B is active, got %', row_count;
  END IF;

  DELETE FROM public.jobs
  WHERE tenant_id = tenant_a;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 0 THEN
    RAISE EXCEPTION 'Expected zero Tenant A rows deleted while tenant B is active, got %', row_count;
  END IF;

  -- Scenario 3: reactivate Tenant A and create a new spell instead of mutating the old one.
  UPDATE public.memberships
  SET status = 'active',
      updated_at = created_at + interval '2 days'
  WHERE id = membership_a;

  INSERT INTO public.membership_spells (
    id,
    membership_id,
    joined_at,
    left_at,
    created_at,
    updated_at
  ) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    membership_a,
    created_at + interval '2 days',
    NULL,
    created_at + interval '2 days',
    created_at + interval '2 days'
  );

  UPDATE public.users
  SET tenant_id = tenant_a,
      leaver_at = NULL,
      updated_at = created_at + interval '2 days'
  WHERE id = user_id;

  SELECT public.current_user_tenant_id() INTO active_tenant;
  IF active_tenant IS DISTINCT FROM tenant_a THEN
    RAISE EXCEPTION 'Expected current tenant A after reactivation, got %', active_tenant;
  END IF;

  SELECT count(*) INTO job_count
  FROM public.jobs;
  IF job_count <> 1 THEN
    RAISE EXCEPTION 'Expected Tenant A job visible after reactivation, got % rows', job_count;
  END IF;

  SELECT count(*) INTO spell_count
  FROM public.membership_spells
  WHERE membership_id = membership_a;
  IF spell_count <> 2 THEN
    RAISE EXCEPTION 'Expected two employment spells for reactivated membership, got %', spell_count;
  END IF;

  SELECT count(*) INTO open_spell_count
  FROM public.membership_spells
  WHERE membership_id = membership_a
    AND left_at IS NULL;
  IF open_spell_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one open spell after reactivation, got %', open_spell_count;
  END IF;
END
$$;

ROLLBACK;

-- Additional behavioral scenarios to add once phase 2 policies land:
-- - a second active membership on another company still keeps each tenant's data separate
-- - staff_acceptances and stock_movements resolve their actor membership_id correctly
-- - auth user deletion does not erase membership history (ON DELETE RESTRICT)
-- - redaction leaves historical spell rows intact but strips live profile fields
