import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import { getSessionTenantOrError } from "@/lib/api-auth";
import { getPeriodMetrics } from "@/lib/metrics/period-totals";

export const runtime = "nodejs";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const rateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
});

function clientIp(headerList: Awaited<ReturnType<typeof headers>>): string {
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  );
}

export async function GET(request: Request) {
  const headerList = await headers();
  const rl = await rateLimit.limit(clientIp(headerList));
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await getSessionTenantOrError();
  if (!session.ok) return session.response;

  const { role, tenantId, supabase } = session;
  if (role !== "owner" && role !== "office") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year");
  const monthParam = url.searchParams.get("month");

  const now = new Date();
  const year = yearParam ? Number(yearParam) : now.getFullYear();
  const month = monthParam ? Number(monthParam) : now.getMonth() + 1;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid month (1–12)" }, { status: 400 });
  }

  const metrics = await getPeriodMetrics(supabase, tenantId, { year, month }, now);
  return NextResponse.json(metrics);
}
