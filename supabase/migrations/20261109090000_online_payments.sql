-- Online invoice payments via Stripe Connect.
--  * tenant_payment_accounts: which Stripe account a company has connected.
--  * job_payments: one row per successful Stripe Checkout payment.
--  * jobs.invoice_pay_token: unguessable token used in the public pay link.
-- Writes to the two new tables happen only from server code using the service
-- role (onboarding and the Stripe webhook), so only SELECT policies are added.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS invoice_pay_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS jobs_invoice_pay_token_key
  ON public.jobs (invoice_pay_token);

CREATE TABLE IF NOT EXISTS public.tenant_payment_accounts (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL UNIQUE,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  stripe_checkout_session_id text NOT NULL UNIQUE,
  stripe_payment_intent_id text,
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'paid',
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_payments_job_idx ON public.job_payments (job_id);

REVOKE ALL ON TABLE public.tenant_payment_accounts FROM PUBLIC;
REVOKE ALL ON TABLE public.job_payments FROM PUBLIC;
GRANT SELECT ON TABLE public.tenant_payment_accounts TO authenticated;
GRANT SELECT ON TABLE public.job_payments TO authenticated;

ALTER TABLE public.tenant_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_payment_accounts_select_office" ON public.tenant_payment_accounts;
CREATE POLICY "tenant_payment_accounts_select_office"
  ON public.tenant_payment_accounts
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_role() IN ('owner', 'office')
  );

DROP POLICY IF EXISTS "job_payments_select_office" ON public.job_payments;
CREATE POLICY "job_payments_select_office"
  ON public.job_payments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND public.current_user_role() IN ('owner', 'office', 'viewer')
  );
