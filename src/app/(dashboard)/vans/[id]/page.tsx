import { notFound } from "next/navigation";
import { getVehicle, getMaintenanceLog } from "@/actions/vehicles";
import { MaintenanceLogForm } from "./maintenance-log-form";

export default async function VehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ data: vehicle, error }, { data: log }] = await Promise.all([
    getVehicle(id),
    getMaintenanceLog(id),
  ]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }
  if (!vehicle) return notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">
        {vehicle.registration}
      </h1>
      <p className="mt-1 text-sm text-slate-600">{vehicle.make_model ?? "—"}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:max-w-lg">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">
            MOT due
          </p>
          <p className="mt-1 text-sm text-slate-900">
            {vehicle.mot_due_date
              ? new Date(vehicle.mot_due_date).toLocaleDateString()
              : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">
            Insurance renewal
          </p>
          <p className="mt-1 text-sm text-slate-900">
            {vehicle.insurance_renewal_date
              ? new Date(vehicle.insurance_renewal_date).toLocaleDateString()
              : "—"}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <MaintenanceLogForm vehicleId={vehicle.id} />

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Maintenance log
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {(log ?? []).length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                No maintenance logged yet.
              </p>
            ) : (
              (log ?? []).map((entry) => (
                <div key={entry.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">
                      {entry.description}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(entry.logged_date).toLocaleDateString()}
                    </span>
                  </div>
                  {entry.cost != null && (
                    <p className="text-xs text-slate-500">
                      Cost: {entry.cost}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
