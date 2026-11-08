import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processScheduledInvoices } from "@/lib/scheduled-invoices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;
  // Compare digests so the check is constant-time regardless of length.
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const results = await processScheduledInvoices();
    return NextResponse.json({
      processed: results.length,
      sent: results.filter((r) => r.status === "sent").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (e) {
    console.error("[cron] send-scheduled-invoices failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cron run failed" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
