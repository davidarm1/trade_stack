export type VatTenant = {
  vat_registered?: boolean | null;
  default_vat_rate?: number | null;
};

export type VatClient = {
  default_vat_exempt?: boolean | null;
};

export type VatJob = {
  vat_rate?: number | null;
  remove_vat?: boolean | null;
};

export type EffectiveVat = {
  showVat: boolean;
  rate: number;
  removeVat: boolean;
  vatAmount: number;
  totalIncVat: number;
};

function finiteOrZero(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function resolveEffectiveVat({
  tenant,
  client: _client,
  job,
  subtotal,
}: {
  tenant: VatTenant;
  client?: VatClient | null;
  job?: VatJob | null;
  subtotal: number;
}): EffectiveVat {
  const normalizedSubtotal = roundMoney(finiteOrZero(subtotal));

  if (!tenant.vat_registered) {
    return {
      showVat: false,
      rate: 0,
      removeVat: true,
      vatAmount: 0,
      totalIncVat: normalizedSubtotal,
    };
  }

  const removeVat = Boolean(job?.remove_vat);
  const rate = removeVat
    ? 0
    : finiteOrZero(job?.vat_rate ?? tenant.default_vat_rate ?? 0);
  const vatAmount = roundMoney(normalizedSubtotal * (rate / 100));

  return {
    showVat: true,
    rate,
    removeVat,
    vatAmount,
    totalIncVat: roundMoney(normalizedSubtotal + vatAmount),
  };
}
