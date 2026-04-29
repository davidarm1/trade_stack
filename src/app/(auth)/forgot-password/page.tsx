"use client";

import Link from "next/link";
import { useState } from "react";
import { requestPasswordReset } from "@/actions/auth";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [redirectToUsed, setRedirectToUsed] = useState<string | null>(null);
  const [devRecoveryUrl, setDevRecoveryUrl] = useState<string | null>(null);
  const [devRecoveryDiag, setDevRecoveryDiag] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setRedirectToUsed(null);
    setDevRecoveryUrl(null);
    setDevRecoveryDiag(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const {
      error: err,
      redirectToUsed: redirect,
      devRecoveryUrl: devUrl,
      devRecoveryDiag: devDiag,
    } = await requestPasswordReset(email);
    setPending(false);
    if (redirect) setRedirectToUsed(redirect);
    if (devUrl) setDevRecoveryUrl(devUrl);
    if (devDiag) setDevRecoveryDiag(devDiag);
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
          ask Supabase to send a reset link.
        </p>

        {sent ? (
          <div className="mt-8 space-y-4 text-sm text-slate-700" role="status">
            <p>
              If that address is registered, Supabase has accepted the request.
              Check spam and wait a minute.{" "}
              <strong>No email is sent for addresses that are not in Auth users</strong>{" "}
              (by design).
            </p>
            <Troubleshoot />
            {redirectToUsed && <RedirectAllowList url={redirectToUsed} />}
            {devRecoveryUrl && <DevRecoveryLink url={devRecoveryUrl} />}
            {devRecoveryDiag && !devRecoveryUrl && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                Dev recovery link: {devRecoveryDiag}
              </p>
            )}
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
            {error && redirectToUsed && (
              <RedirectAllowList url={redirectToUsed} />
            )}
            {error && devRecoveryUrl && <DevRecoveryLink url={devRecoveryUrl} />}
            {error && devRecoveryDiag && !devRecoveryUrl && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                Dev recovery: {devRecoveryDiag}
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

function Troubleshoot() {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
      <p className="font-medium text-slate-900">Still nothing?</p>
      <ul className="mt-2 list-inside list-disc space-y-1">
        <li>
          In the Supabase dashboard, open{" "}
          <span className="font-medium">Authentication → Users</span> and confirm
          this exact email exists.
        </li>
        <li>
          <span className="font-medium">Local Supabase</span> (CLI): auth mail is
          captured in the Mailpit / Inbucket URL printed by{" "}
          <code className="rounded bg-slate-200/80 px-1">supabase status</code>,
          not your normal inbox.
        </li>
        <li>
          <span className="font-medium">Hosted project</span>: check Spam; for
          reliable delivery configure{" "}
          <span className="font-medium">Auth → SMTP settings</span> (the built-in
          provider is rate-limited).
        </li>
      </ul>
    </div>
  );
}

function RedirectAllowList({ url }: { url: string }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
      <p className="font-medium text-amber-900">
        Add this exact URL under Supabase → Authentication → URL configuration →
        Redirect URLs:
      </p>
      <p className="mt-1 break-all font-mono text-[0.8rem] leading-relaxed">
        {url}
      </p>
      <p className="mt-2 text-amber-900/90">
        If it is missing, Supabase often returns an error instead of sending
        mail.
      </p>
    </div>
  );
}

function DevRecoveryLink({ url }: { url: string }) {
  return (
    <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950">
      <p className="font-medium text-violet-900">
        Development: open this link once (same as the email). Do not ship this
        mode to production.
      </p>
      <a
        href={url}
        className="mt-2 block break-all font-mono text-[0.75rem] leading-relaxed text-violet-900 underline"
      >
        {url}
      </a>
    </div>
  );
}
