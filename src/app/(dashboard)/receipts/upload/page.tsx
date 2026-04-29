import { redirect } from "next/navigation";

export default async function UploadReceiptPage() {
  redirect("/receipts");
}
