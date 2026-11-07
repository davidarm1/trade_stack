import { describe, expect, it } from "vitest";
import { parseWorkLines } from "./work-lines";

describe("parseWorkLines", () => {
  it("strips bullet and number markers and blank lines", () => {
    expect(
      parseWorkLines("* Managed Hosting\n- Support\n\n1. Platform\n2) SEO\n  • Extra  "),
    ).toEqual(["Managed Hosting", "Support", "Platform", "SEO", "Extra"]);
  });

  it("keeps plain lines and handles empty input", () => {
    expect(parseWorkLines("Fitted boiler")).toEqual(["Fitted boiler"]);
    expect(parseWorkLines(null)).toEqual([]);
    expect(parseWorkLines("  \n ")).toEqual([]);
  });
});
