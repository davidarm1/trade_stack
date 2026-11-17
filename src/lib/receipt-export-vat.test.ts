import { describe, expect, it } from "vitest";
import { isVatRegistered, vatFileSuffix, xeroAmountFields } from "./receipt-export-vat";

describe("isVatRegistered", () => {
  it("follows the VAT number", () => {
    expect(isVatRegistered("GB123456789")).toBe(true);
    expect(isVatRegistered("  ")).toBe(false);
    expect(isVatRegistered(null)).toBe(false);
  });
});

describe("xeroAmountFields", () => {
  const row = { amount_total: 120, amount_net: 100, amount_tax: 20 };
  it("uses net + tax with the 20% type when VAT is included", () => {
    expect(xeroAmountFields(row, true)).toEqual({
      unitAmount: 100,
      taxType: "20% (VAT on Expenses)",
      taxAmount: 20,
    });
  });
  it("uses No VAT for a line with no VAT amount even when VAT is included", () => {
    expect(xeroAmountFields({ amount_total: 50, amount_net: 50, amount_tax: 0 }, true).taxType).toBe(
      "No VAT",
    );
    expect(xeroAmountFields({ amount_total: 50 }, true).taxType).toBe("No VAT");
  });
  it("exports the gross total with no tax when VAT is excluded", () => {
    expect(xeroAmountFields(row, false)).toEqual({
      unitAmount: 120,
      taxType: "No VAT",
      taxAmount: null,
    });
  });
});

describe("vatFileSuffix", () => {
  it("marks only no-VAT files", () => {
    expect(vatFileSuffix(true)).toBe("");
    expect(vatFileSuffix(false)).toBe("-novat");
  });
});
