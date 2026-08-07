import { notFound } from "next/navigation";
import { getVehicle } from "@/actions/vehicles";
import { getVanStock } from "@/actions/van-stock";
import { getStockItems } from "@/actions/stock";
import { AllocateStockForm } from "./allocate-stock-form";
import { StockCheckRow } from "./stock-check-row";

export default async function VanStockPage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  const [{ data: vehicle, error: vehicleErr }, { data: vanStock, error: vanStockErr }, { data: storeItems }] =
    await Promise.all([
      getVehicle(vehicleId),
      getVanStock(vehicleId),
      getStockItems(),
    ]);

  if (vehicleErr) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {vehicleErr}
      </div>
    );
  }
  if (!vehicle) return notFound();
  if (vanStockErr) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {vanStockErr}
      </div>
    );
  }

  const rows = vanStock ?? [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">
        {vehicle.registration} — stock
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Allocated items and their last stock-check.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Allocated stock
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                Nothing allocated to this van yet.
              </p>
            ) : (
              rows.map((row) => <StockCheckRow key={row.id} row={row} />)
            )}
          </div>
        </div>

        <AllocateStockForm vehicleId={vehicleId} storeItems={storeItems ?? []} />
      </div>
    </div>
  );
}
