"use client";

import { revalidateReceiptsPage } from "@/actions/receipts";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

async function sha256Hex(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type UploadReceiptFormProps = {
  /** Called after a successful upload and list refresh (e.g. close modal + flash toast). */
  onUploadSuccess?: () => void;
};

export function UploadReceiptForm({ onUploadSuccess }: UploadReceiptFormProps) {
  const router = useRouter();
  const requestIdRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clearSelectedFile(formEl: HTMLFormElement | null) {
    setFile(null);
    if (!formEl) return;
    const fileInput = formEl.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    if (fileInput) fileInput.value = "";
  }

  async function afterSuccessfulUpload(
    requestId: number,
    formEl: HTMLFormElement | null,
  ) {
    if (requestId !== requestIdRef.current) return;
    setError(null);
    clearSelectedFile(formEl);
    await revalidateReceiptsPage();
    await router.refresh();
    onUploadSuccess?.();
  }

  async function finalizeViaServerMultipart(
    requestId: number,
    file: File,
    formEl: HTMLFormElement | null,
  ) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/outgoings/scan-receipt", {
      method: "POST",
      body: form,
    });
    let data: {
      error?: string;
      success?: boolean;
      accepted?: boolean;
      pendingOcr?: boolean;
    } | null = null;
    try {
      data = (await res.json()) as {
        error?: string;
        success?: boolean;
        accepted?: boolean;
        pendingOcr?: boolean;
      };
    } catch {
      data = null;
    }
    if (!res.ok) {
      if (requestId !== requestIdRef.current) return;
      setError(
        data?.error ??
          `Upload failed (${res.status}). Check server configuration.`,
      );
      return;
    }
    await afterSuccessfulUpload(requestId, formEl);
  }

  async function finalizeViaDirectUploadMeta(
    requestId: number,
    formEl: HTMLFormElement | null,
    meta: { key: string; publicUrl: string; fileName: string; fileType: string },
  ) {
    const res = await fetch("/api/outgoings/scan-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });
    let data: {
      error?: string;
      success?: boolean;
      accepted?: boolean;
      pendingOcr?: boolean;
    } | null = null;
    try {
      data = (await res.json()) as {
        error?: string;
        success?: boolean;
        accepted?: boolean;
        pendingOcr?: boolean;
      };
    } catch {
      data = null;
    }
    if (!res.ok) {
      if (requestId !== requestIdRef.current) return;
      setError(
        data?.error ??
          `Upload failed (${res.status}). Check server configuration.`,
      );
      return;
    }
    await afterSuccessfulUpload(requestId, formEl);
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setError(null);
    if (!file) {
      setError("Please choose an outgoing file first.");
      return;
    }

    setPending(true);
    try {
      const fileSha = await sha256Hex(file);
      const presignRes = await fetch("/api/outgoings/scan-receipt/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSha,
        }),
      });
      const presign = (await presignRes.json()) as {
        error?: string;
        key?: string;
        publicUrl?: string;
        uploadUrl?: string;
        mimeType?: string;
      };
      if (!presignRes.ok || !presign.uploadUrl || !presign.publicUrl || !presign.key) {
        if (requestId !== requestIdRef.current) return;
        setError(
          presign.error ?? `Could not start upload (${presignRes.status}).`,
        );
        return;
      }

      const b2Res = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type":
            presign.mimeType || file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!b2Res.ok) {
        if (requestId !== requestIdRef.current) return;
        setError(`Backblaze upload failed (${b2Res.status}). Please retry.`);
        return;
      }
      await finalizeViaDirectUploadMeta(requestId, formEl, {
        key: presign.key,
        publicUrl: presign.publicUrl,
        fileName: file.name,
        fileType: file.type,
      });
    } catch {
      try {
        await finalizeViaServerMultipart(requestId, file, formEl);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setError(null);
        clearSelectedFile(formEl);
        await revalidateReceiptsPage();
        await router.refresh();
      }
    } finally {
      if (requestId !== requestIdRef.current) return;
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleUpload} className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <label className="block text-sm font-medium text-slate-700">
        Outgoing file (PDF or image)
      </label>
      <input
        type="file"
        accept=".pdf,image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="mt-2 block w-full text-sm"
      />
      <p className="mt-1 text-xs text-slate-500">
        Supported: PDF, JPG, PNG, WEBP, GIF.
      </p>
      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Uploading..." : "Upload and OCR"}
      </button>
    </form>
  );
}
