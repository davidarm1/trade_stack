import { NewStockItemForm } from "./new-stock-item-form";

export default function NewStockItemPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">New stock item</h1>
      <p className="mt-1 text-sm text-slate-600">
        Add an item to the store room catalog.
      </p>
      <NewStockItemForm />
    </div>
  );
}
