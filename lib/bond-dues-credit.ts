export const BOND_DUES_CREDIT_PREFIX = "BOND-DUES:";

export function bondDuesCreditBatchPrefix(collectionId: string) {
  return `${BOND_DUES_CREDIT_PREFIX}${collectionId}:`;
}

export function bondDuesCreditBatchId(collectionId: string, token: string) {
  return `${bondDuesCreditBatchPrefix(collectionId)}${token}`;
}

export function isBondDuesCreditPayment(payment: { paymentBatchId?: string | null }) {
  return Boolean(payment.paymentBatchId?.startsWith(BOND_DUES_CREDIT_PREFIX));
}

export function bondDuesCreditCollectionId(payment: { paymentBatchId?: string | null }) {
  const value = payment.paymentBatchId;
  if (!value?.startsWith(BOND_DUES_CREDIT_PREFIX)) return null;
  const remainder = value.slice(BOND_DUES_CREDIT_PREFIX.length);
  const separator = remainder.indexOf(":");
  return separator > 0 ? remainder.slice(0, separator) : null;
}
