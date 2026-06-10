"use client";

import Link from "next/link";
import { useState } from "react";
import { requestPasswordReset } from "@/actions/auth";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const { error: err } = await requestPasswordReset(email);
    setPending(false);
    if (err) {
      setError(err);
      setSent(false);
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Reset password</h1>
        <p className="mt-1 text-sm text-slate-600">
          Enter the email you use for Trade Stack. If an account exists, we will
          email a reset link.
        </p>

        {sent ? (
          <div className="mt-8 space-y-4 text-sm text-slate-700" role="status">
            <p>
              If that address is registered, check your inbox and spam folder.
            </p>
            <p>
              You can return to the sign-in page once you’ve updated your password.
            </p>
          </div>
        ) : (
          <form
            method="post"
            onSubmit={handleSubmit}
            className="mt-8 space-y-4"
          >
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-sm text-slate-600">
          <Link href="/login" className="font-medium text-slate-900 underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
