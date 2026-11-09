import { describe, expect, it } from "vitest";
import { isPayToken, toMinorUnits } from "./payments";

describe("toMinorUnits", () => {
  it("converts pounds to pence and avoids float drift", () => {
    expect(toMinorUnits(150, "GBP")).toBe(15000);
    expect(toMinorUnits("19.99", "GBP")).toBe(1999);
    expect(toMinorUnits(0.1 + 0.2, "GBP")).toBe(30);
  });
  it("rejects zero, negative and non-numeric amounts", () => {
    expect(toMinorUnits(0, "GBP")).toBeNull();
    expect(toMinorUnits(-5, "GBP")).toBeNull();
    expect(toMinorUnits("abc", "GBP")).toBeNull();
    expect(toMinorUnits(null, "GBP")).toBeNull();
  });
  it("does not multiply zero-decimal currencies", () => {
    expect(toMinorUnits(1500, "JPY")).toBe(1500);
  });
});

describe("isPayToken", () => {
  it("accepts UUIDs only", () => {
    expect(isPayToken("3f2b8c1e-9d4a-4c7e-8a51-0b6d2f9e7c13")).toBe(true);
    expect(isPayToken("not-a-token")).toBe(false);
    expect(isPayToken("../../etc/passwd")).toBe(false);
  });
});
