import { getSettings } from "@/actions/settings";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { data, error } = await getSettings();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-600">
        Company profile and defaults for invoices and jobs.
      </p>
      <SettingsForm
        tenant={data?.tenant ?? null}
        keyValues={data?.keyValues ?? {}}
      />
    </div>
  );
}
