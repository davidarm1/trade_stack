/** Test-only: treat this card number (digits only) as payment approved. */
export const TEST_APPROVED_CARD_NUMBER = "63430";

export type PackageId = "core" | "pro";

export const PACKAGES: {
  id: PackageId;
  name: string;
  description: string;
  priceMonthlyLabel: string;
}[] = [
  {
    id: "core",
    name: "Core",
    description: "Jobs, clients, quotes, and core office workflows.",
    priceMonthlyLabel: "From £49/mo",
  },
  {
    id: "pro",
    name: "Pro",
    description: "Everything in Core plus advanced reporting and priority support.",
    priceMonthlyLabel: "From £99/mo",
  },
];

export function tenantPlanValue(
  packageId: PackageId,
  billing: "monthly",
): string {
  return `${packageId}_${billing}`;
}

/** Normalize user input to digits only for comparison. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function isTestPaymentApproved(cardInput: string): boolean {
  return digitsOnly(cardInput) === TEST_APPROVED_CARD_NUMBER;
}
