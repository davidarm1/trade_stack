"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createEmailTemplate } from "@/actions/email-marketing";

export function NewTemplateForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);

    const { data, error: err } = await createEmailTemplate({
      name: String(form.get("name") ?? ""),
      subject: String(form.get("subject") ?? ""),
      bodyHtml: String(form.get("body_html") ?? ""),
    });

    setPending(false);
    if (err || !data) {
      setError(err ?? "Could not create template");
      return;
    }
    router.push(`/email-marketing/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Template name
        </label>
        <input
          name="name"
          required
          placeholder="e.g. Summer promo"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Subject line
        </label>
        <input
          name="subject"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Body (HTML)
        </label>
        <textarea
          name="body_html"
          required
          rows={10}
          placeholder="<p>Hello!</p>"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
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
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Create template"}
      </button>
    </form>
  );
}
