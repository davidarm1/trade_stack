"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { normalizeAuthNextPath } from "@/lib/auth-links";
import { createClient } from "@/lib/supabase/client";

export default function MfaChallengePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = normalizeAuthNextPath(
    searchParams.get("next"),
    "/auth/reset-password",
  );
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const session = data.session ?? null;
      setHasSession(Boolean(session));
      setCheckingSession(false);
      if (!session) {
        setError(
          "Your reset session is missing. Request a new password reset email and try again.",
        );
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!hasSession) {
      setError(
        "Your reset session is missing. Request a new password reset email and try again.",
      );
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { data: factors, error: factorsError } =
      await supabase.auth.mfa.listFactors();
    if (factorsError) {
      setPending(false);
      setError(factorsError.message);
      return;
    }

    const factor = factors.totp[0];
    if (!factor) {
      setPending(false);
      setError("No authenticator app was found for this account.");
      return;
    }

    const normalizedCode = code.replace(/\s+/g, "");
    const { error: challengeError } =
      await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: normalizedCode,
      });
    setPending(false);

    if (challengeError) {
      setError(challengeError.message || "Invalid code, please try again.");
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          Two-factor authentication required
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Enter your authenticator app code to continue.
        </p>

        {checkingSession ? (
          <p className="mt-8 text-sm text-slate-600">Checking your reset session…</p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="mfa-code"
              className="block text-sm font-medium text-slate-700"
            >
              Authentication code
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
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              required
            />
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || checkingSession || !hasSession}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "Verifying…" : "Verify"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-600">
          <Link href="/login" className="font-medium text-slate-900 underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
