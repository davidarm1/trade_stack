import Link from "next/link";
import { getSettings } from "@/actions/settings";
import { NewClientForm } from "./new-client-form";

export default async function NewClientPage() {
  const { data } = await getSettings();

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
      <NewClientForm vatRegistered={Boolean(data?.tenant?.vat_registered)} />
    </div>
  );
}
