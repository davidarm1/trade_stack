import { describe, expect, it } from "vitest";
import {
  evaluatePlatformAdminAccess,
  PLATFORM_ADMIN_API_ROUTES,
} from "./platform-admin-access";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("evaluatePlatformAdminAccess", () => {
  it("returns unauthenticated when there is no user", () => {
    expect(
      evaluatePlatformAdminAccess({ userId: null, isAllowlisted: false }),
    ).toEqual({ status: "unauthenticated" });
  });

  it("returns forbidden for authenticated non-admins", () => {
    expect(
      evaluatePlatformAdminAccess({
        userId: "user-1",
        isAllowlisted: false,
      }),
    ).toEqual({ status: "forbidden" });
  });

  it("returns ok for allowlisted platform admins", () => {
    expect(
      evaluatePlatformAdminAccess({
        userId: "user-1",
        isAllowlisted: true,
      }),
    ).toEqual({ status: "ok", userId: "user-1" });
  });
});

describe("platform admin API route gating", () => {
  it("documents every /api/admin route and requires requirePlatformAdmin in source", () => {
    for (const route of PLATFORM_ADMIN_API_ROUTES) {
      const relative = `src/app${route}/route.ts`;
      const source = readFileSync(resolve(process.cwd(), relative), "utf8");
      expect(source).toContain("requirePlatformAdmin");
    }
  });

  it("keeps service-role client behind server-only", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/supabase/admin.ts"),
      "utf8",
    );
    expect(source).toContain('import "server-only"');
    expect(source).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
