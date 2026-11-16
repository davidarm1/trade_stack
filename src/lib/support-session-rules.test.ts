import { describe, expect, it } from "vitest";
import {
  clampSupportMinutes,
  parseSupportMode,
  roleForSupportMode,
  validateSupportReason,
} from "./support-session-rules";

describe("support session rules", () => {
  it("defaults to view-only and only grants owner for full", () => {
    expect(parseSupportMode("full")).toBe("full");
    expect(parseSupportMode("owner")).toBe("view");
    expect(parseSupportMode(undefined)).toBe("view");
    expect(roleForSupportMode("view")).toBe("viewer");
    expect(roleForSupportMode("full")).toBe("owner");
  });

  it("clamps the duration to a sane range", () => {
    expect(clampSupportMinutes("30")).toBe(30);
    expect(clampSupportMinutes(99999)).toBe(240);
    expect(clampSupportMinutes(0)).toBe(60);
    expect(clampSupportMinutes("abc")).toBe(60);
  });

  it("requires a meaningful reason", () => {
    expect(validateSupportReason("  ").error).not.toBeNull();
    expect(validateSupportReason("ok").error).not.toBeNull();
    const ok = validateSupportReason("  Ticket 4821:   invoice won't send ");
    expect(ok.error).toBeNull();
    expect(ok.reason).toBe("Ticket 4821: invoice won't send");
  });
});
