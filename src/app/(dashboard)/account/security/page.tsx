"use client";

import { useEffect, useMemo, useState } from "react";
import {
  enrollMfa,
  getMfaStatus,
  removeMfa,
  verifyMfaEnrollment,
} from "@/actions/auth";

type MfaStatus = {
  enrolled: boolean;
  factorId: string | null;
};

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

function qrCodeSrc(qrCode: string): string {
  if (qrCode.startsWith("data:")) return qrCode;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`;
}

export default function AccountSecurityPage() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const qrSrc = useMemo(
    () => (enrollment ? qrCodeSrc(enrollment.qrCode) : null),
    [enrollment],
  );

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      const result = await getMfaStatus();
      if (!active) return;
      if (result.error) {
        setError(result.error);
      } else {
        setStatus(result.data);
      }
    }

    void loadStatus();
    return () => {
      active = false;
    };
  }, []);

  async function handleEnroll() {
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await enrollMfa();
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setEnrollment(result.data);
  }

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!enrollment) return;

    setPending(true);
    setError(null);
    setMessage(null);
    const result = await verifyMfaEnrollment(enrollment.factorId, code);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setStatus({ enrolled: true, factorId: enrollment.factorId });
    setEnrollment(null);
    setCode("");
    setMessage("Two-factor authentication is now enabled.");
  }

  async function handleRemove() {
    if (!status?.factorId) return;

    setPending(true);
    setError(null);
    setMessage(null);
    const result = await removeMfa(status.factorId);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setStatus({ enrolled: false, factorId: null });
    setMessage("Two-factor authentication has been removed.");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">
        Account security
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Add an optional authenticator app code to protect your Trade Stack
        account.
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Two-factor authentication
        </h2>

        {!status && !error ? (
          <p className="mt-4 text-sm text-slate-600">Loading security status…</p>
        ) : null}

        {status?.enrolled ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm font-medium text-emerald-700">
              Two-Factor Authentication is enabled.
            </p>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={pending}
              className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {pending ? "Removing…" : "Remove"}
            </button>
          </div>
        ) : null}

        {status && !status.enrolled ? (
          <div className="mt-4 space-y-4">
            {!enrollment ? (
              <button
                type="button"
                onClick={() => void handleEnroll()}
                disabled={pending}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {pending
                  ? "Generating QR code…"
                  : "Enable Two-Factor Authentication"}
              </button>
            ) : null}

            {enrollment && qrSrc ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-700">
                    Scan this QR code with Google Authenticator or another TOTP
                    authenticator app.
                  </p>
                  {/* Supabase returns an SVG QR code for the TOTP secret. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrSrc}
                    alt="Two-factor authentication QR code"
                    className="mt-3 h-48 w-48 rounded-lg border border-slate-200 bg-white p-2"
                  />
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Manual entry secret
                  </p>
                  <code className="mt-1 block break-all rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-900">
                    {enrollment.secret}
                  </code>
                </div>

                <form onSubmit={handleVerify} className="space-y-3">
                  <div>
                    <label
                      htmlFor="mfa-code"
                      className="block text-sm font-medium text-slate-700"
                    >
                      6-digit code
                    </label>
                    <input
                      id="mfa-code"
                      name="code"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="mt-1 w-40 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {pending ? "Verifying…" : "Verify and enable"}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ) : null}

        {message ? (
          <p className="mt-4 text-sm text-emerald-700" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
