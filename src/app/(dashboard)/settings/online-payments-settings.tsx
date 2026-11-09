"use client";

import { useState } from "react";
import { disconnectStripe, startStripeOnboarding } from "@/actions/payments";
import type { PaymentAccountStatus } from "@/actions/payments";

export function OnlinePaymentsSettings({ status }: { status: PaymentAccountStatus }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    const { url, error: err } = await startStripeOnboarding();
    if (err || !url) {
      setBusy(false);
      setError(err ?? "Could not start Stripe setup.");
      return;
    }
    window.location.href = url;
  }

  async function disconnect() {
    if (!window.confirm("Stop taking online payments? Your Stripe account is not deleted.")) return;
    setBusy(true);
    setError(null);
    const { error: err } = await disconnectStripe();
    setBusy(false);
    if (err) setError(err);
    else window.location.reload();
  }

  const ready = status.connected && status.chargesEnabled;
  const pending = status.connected && !status.chargesEnabled;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Online payments</h2>
      <p className="mt-1 text-sm text-slate-600">
        Let customers pay invoices by card. Payments go to your own Stripe account and are paid out
        to your bank by Stripe. Invoice emails get a <strong>Pay online</strong> button, and the job
        is marked paid automatically.
      </p>

      {!status.platformConfigured ? (
        <p className="mt-3 text-sm text-amber-800">
          Online payments are not switched on for this platform yet.
        </p>
      ) : ready ? (
        <p className="mt-3 text-sm text-emerald-700">
          Connected. Customers can pay your invoices online.
          {!status.payoutsEnabled ? " Payouts are not enabled yet — finish setup in Stripe." : ""}
        </p>
      ) : pending ? (
        <p className="mt-3 text-sm text-amber-800">
          Stripe setup isn&apos;t finished yet. Continue to complete it — online payments switch on
          once Stripe approves the account.
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-600">Not connected.</p>
      )}

      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {status.platformConfigured ? (
        status.canManage ? (
          <div className="mt-3 flex gap-2">
            {!ready ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void connect()}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? "Opening Stripe…" : pending ? "Continue Stripe setup" : "Connect Stripe"}
              </button>
            ) : null}
            {status.connected ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void disconnect()}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              >
                Disconnect
              </button>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Only the company owner can change this.</p>
        )
      ) : null}
    </section>
  );
}
