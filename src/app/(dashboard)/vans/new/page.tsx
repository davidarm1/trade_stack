import { NewVehicleForm } from "./new-vehicle-form";

export default function NewVehiclePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">New vehicle</h1>
      <p className="mt-1 text-sm text-slate-600">Add a van to the fleet.</p>
      <NewVehicleForm />
    </div>
  );
}
