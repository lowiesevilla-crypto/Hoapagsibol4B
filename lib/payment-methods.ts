export const paymentMethodValues = ["CASH", "BANK_TRANSFER", "GCASH", "CHECK", "OTHER"] as const;

export type PaymentMethodValue = (typeof paymentMethodValues)[number];

export function paymentMethodRequiresReference(method: string) {
  return method !== "CASH";
}

export function paymentMethodLabel(method: string) {
  return method.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizePaymentReference(method: string, referenceNumber?: string | null) {
  const normalized = referenceNumber?.trim() || null;
  if (paymentMethodRequiresReference(method) && !normalized) {
    throw new Error(`Reference number is required for ${paymentMethodLabel(method)} payments.`);
  }
  return normalized;
}
