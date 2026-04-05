import Link from "next/link";

export default function UploadReceiptPage() {
  return (
    <div>
      <Link
        href="/receipts"
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to receipts
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">
        Upload receipt
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {/* TODO: Wire Supabase Storage upload + createReceipt server action + optional AI extraction. */}
        File upload and OCR pipeline are not implemented in this scaffold.
      </p>
    </div>
  );
}
