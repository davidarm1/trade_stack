export const PAYMENT_TERMS_PRESETS = [0, 7, 14, 30] as const;

export type PaymentTermsPreset = (typeof PAYMENT_TERMS_PRESETS)[number];

export function paymentTermsLabel(days: number | null | undefined): string {
  const value = days == null ? Number.NaN : Number(days);
  if (!Number.isFinite(value) || value < 0) return "";
  if (value === 0) return "on receipt";
  if (value === 30) return "1 month";
  return `${value} day${value === 1 ? "" : "s"}`;
}

export function paymentTermsSentence(days: number | null | undefined): string {
  const value = days == null ? Number.NaN : Number(days);
  const descriptor = paymentTermsLabel(value);
  if (!descriptor) return "";

  const duePart =
    value === 0
      ? "Payment due on receipt"
      : value === 30
        ? "Payment due within 1 month of invoice date"
        : `Payment due within ${descriptor} of invoice date`;
  return `${duePart}. Late payments may incur interest and recovery costs in line with the Late Payment of Commercial Debts (Interest) Act 1998.`;
}
