export const HOMEOWNER_PAYMENT_FLOWS = ["MANUAL_QR", "PAYMONGO"] as const;

export type HomeownerPaymentFlow = (typeof HOMEOWNER_PAYMENT_FLOWS)[number];

export const DEFAULT_HOMEOWNER_PAYMENT_FLOW: HomeownerPaymentFlow = "MANUAL_QR";
export const PAYMONGO_PAYMENT_REQUEST_MARKER = "application/x-hoahub-paymongo";
export const PAYMONGO_CANCELLED_REMARK = "PayMongo checkout cancelled by homeowner.";

export function normalizeHomeownerPaymentFlow(value?: string | null): HomeownerPaymentFlow {
  return value === "PAYMONGO" ? "PAYMONGO" : DEFAULT_HOMEOWNER_PAYMENT_FLOW;
}

export function isPayMongoPaymentRequest(request: { proofContentType?: string | null }) {
  return request.proofContentType === PAYMONGO_PAYMENT_REQUEST_MARKER;
}
