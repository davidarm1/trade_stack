"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadReceiptForm } from "./upload/upload-receipt-form";

const FLASH_MS = 1000;

export function AddOutgoingModal() {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlash = useCallback((message: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlash(message);
    flashTimerRef.current = setTimeout(() => {
      setFlash(null);
      flashTimerRef.current = null;
    }, FLASH_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Add Outgoing
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add outgoing"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Add Outgoing
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Upload a PDF or image — we scan it with AI and save it securely.
            </p>
            <UploadReceiptForm
              initialPaymentStatus="paid"
              onUploadSuccess={() => {
                setOpen(false);
                showFlash("Record added");
              }}
            />
          </div>
        </div>
      ) : null}

      {flash ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-opacity duration-200"
        >
          {flash}
        </div>
      ) : null}
    </>
  );
}
