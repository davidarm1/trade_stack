import { getPaymentAccountStatus, refreshStripeAccount } from "@/actions/payments";
import { getSettings } from "@/actions/settings";
import { SettingsForm } from "./settings-form";
import { OnlinePaymentsSettings } from "./online-payments-settings";
import { TravelPaySettings } from "./travel-pay-settings";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  const { stripe } = await searchParams;
  // Coming back from Stripe onboarding: pull the new account status first.
  if (stripe === "return" || stripe === "refresh") await refreshStripeAccount();
  const { data, error } = await getSettings();
  const { data: paymentStatus } = await getPaymentAccountStatus();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Company profile and defaults for invoices and jobs.
        </p>
      </header>
      <SettingsForm
        tenant={data?.tenant ?? null}
        keyValues={data?.keyValues ?? {}}
      />
      <TravelPaySettings keyValues={data?.keyValues ?? {}} />
      {paymentStatus ? <OnlinePaymentsSettings status={paymentStatus} /> : null}
    </div>
  );
}
