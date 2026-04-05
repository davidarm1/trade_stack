import Link from "next/link";
import { NewClientForm } from "./new-client-form";

export default function NewClientPage() {
  return (
    <div>
      <Link
        href="/clients"
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to clients
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">New client</h1>
      <p className="mt-1 text-sm text-slate-600">
        Add a company and default contact details.
      </p>
      <NewClientForm />
    </div>
  );
}
