import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient } from "@/actions/clients";
import { NewClientForm } from "../../new/new-client-form";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: client, error } = await getClient(id);
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }
  if (!client || client.deleted_at) notFound();

  return (
    <div>
      <Link
        href="/clients"
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to clients
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">
        Edit client
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Correct the address, contact or default site details for{" "}
        {client.company_name}.
      </p>
      <NewClientForm client={client} />
    </div>
  );
}
