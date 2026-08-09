export const PAYMONGO_BATCH_DESCRIPTION_PREFIX = "PMB:";
export const PAYMONGO_CHECKOUT_SESSION_REMARK_PREFIX = "PAYMONGO_CHECKOUT_SESSION:";

export function paymongoBatchDescription(batchId: string) {
  const value = batchId.trim();
  if (!value) throw new Error("PayMongo batch ID is required.");
  return `${PAYMONGO_BATCH_DESCRIPTION_PREFIX}${value}`;
}

export function paymongoBatchId(description: string | null | undefined, fallbackRequestId: string) {
  const value = String(description || "").trim();
  if (!value.startsWith(PAYMONGO_BATCH_DESCRIPTION_PREFIX)) return fallbackRequestId;
  const batchId = value.slice(PAYMONGO_BATCH_DESCRIPTION_PREFIX.length).trim();
  return batchId || fallbackRequestId;
}

export function paymongoCheckoutSessionRemark(checkoutId: string) {
  const value = checkoutId.trim();
  if (!value.startsWith("cs_")) throw new Error("PayMongo checkout session ID is invalid.");
  return `${PAYMONGO_CHECKOUT_SESSION_REMARK_PREFIX}${value}`;
}

export function paymongoCheckoutSessionId(reviewRemarks: string | null | undefined) {
  const value = String(reviewRemarks || "").trim();
  if (!value.startsWith(PAYMONGO_CHECKOUT_SESSION_REMARK_PREFIX)) return "";
  const checkoutId = value.slice(PAYMONGO_CHECKOUT_SESSION_REMARK_PREFIX.length).trim();
  return checkoutId.startsWith("cs_") ? checkoutId : "";
}

export function isPaymongoCheckoutSessionRemark(reviewRemarks: string | null | undefined) {
  return Boolean(paymongoCheckoutSessionId(reviewRemarks));
}
