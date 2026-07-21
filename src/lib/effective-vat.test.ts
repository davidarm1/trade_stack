import { describe, expect, it } from "vitest";
import { resolveEffectiveVat } from "./effective-vat";

describe("resolveEffectiveVat", () => {
  it("forces VAT off for an unregistered tenant", () => {
    expect(
      resolveEffectiveVat({
        tenant: { vat_registered: false, default_vat_rate: 20 },
        job: { vat_rate: 15, remove_vat: false },
        subtotal: 100,
      }),
    ).toEqual({
      showVat: false,
      rate: 0,
      removeVat: true,
      vatAmount: 0,
      totalIncVat: 100,
    });
  });

  it("uses the job rate before the registered tenant default", () => {
    expect(
      resolveEffectiveVat({
        tenant: { vat_registered: true, default_vat_rate: 20 },
        job: { vat_rate: 5, remove_vat: false },
        subtotal: 100,
      }),
    ).toEqual({
      showVat: true,
      rate: 5,
      removeVat: false,
      vatAmount: 5,
      totalIncVat: 105,
    });
  });

  it("uses the tenant default when the registered job has no rate", () => {
    expect(
      resolveEffectiveVat({
        tenant: { vat_registered: true, default_vat_rate: 20 },
        job: { vat_rate: null, remove_vat: false },
        subtotal: 49.99,
      }),
    ).toEqual({
      showVat: true,
      rate: 20,
      removeVat: false,
      vatAmount: 10,
      totalIncVat: 59.99,
    });
  });

  it("honours a registered job's remove-VAT override", () => {
    expect(
      resolveEffectiveVat({
        tenant: { vat_registered: true, default_vat_rate: 20 },
        job: { vat_rate: 20, remove_vat: true },
        subtotal: 100,
      }),
    ).toEqual({
      showVat: true,
      rate: 0,
      removeVat: true,
      vatAmount: 0,
      totalIncVat: 100,
    });
  });
});
