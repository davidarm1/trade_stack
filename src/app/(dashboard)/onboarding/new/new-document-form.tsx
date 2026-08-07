"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createOnboardingDocument } from "@/actions/onboarding";

export function NewDocumentForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);

    const { data, error: err } = await createOnboardingDocument({
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      required: form.get("required") === "on",
    });

    setPending(false);
    if (err || !data) {
      setError(err ?? "Could not create document");
      return;
    }
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Title
        </label>
        <input
          name="title"
          required
          placeholder="e.g. Staff Handbook"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Body
        </label>
        <textarea
          name="body"
          required
          rows={10}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id="required"
          name="required"
          type="checkbox"
          defaultChecked
          className="rounded border-slate-300"
        />
        <label htmlFor="required" className="text-sm text-slate-700">
          Required — staff are blocked until they accept this
        </label>
      </div>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Create document"}
      </button>
    </form>
  );
}
