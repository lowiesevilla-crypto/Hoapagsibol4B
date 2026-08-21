export type PayMongoGatewayState =
  | "AWAITING_PAYMENT"
  | "AWAITING_ACTION"
  | "PROCESSING"
  | "FAILED_RETRYABLE"
  | "PAID"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED"
  | "UNAVAILABLE";

export const PAYMONGO_GATEWAY_REMARK_PREFIX = "PAYMONGO_GATEWAY_STATE:";

const knownStates = new Set<PayMongoGatewayState>([
  "AWAITING_PAYMENT",
  "AWAITING_ACTION",
  "PROCESSING",
  "FAILED_RETRYABLE",
  "PAID",
  "CANCELLED",
  "EXPIRED",
  "FAILED",
  "UNAVAILABLE",
]);

export function paymongoGatewayRemark(state: PayMongoGatewayState) {
  return `${PAYMONGO_GATEWAY_REMARK_PREFIX}${state}`;
}

export function paymongoGatewayStateFromRemark(value: string | null | undefined): PayMongoGatewayState | null {
  const raw = String(value || "").trim();
  if (!raw.startsWith(PAYMONGO_GATEWAY_REMARK_PREFIX)) return null;
  const state = raw.slice(PAYMONGO_GATEWAY_REMARK_PREFIX.length).trim() as PayMongoGatewayState;
  return knownStates.has(state) ? state : null;
}

export function paymongoGatewayPresentation(state: PayMongoGatewayState) {
  switch (state) {
    case "PAID":
      return { label: "Paid & Reconciled", tone: "success" as const, terminal: true, canResume: false };
    case "PROCESSING":
      return { label: "Processing", tone: "info" as const, terminal: false, canResume: false };
    case "AWAITING_ACTION":
      return { label: "Awaiting Customer Action", tone: "warning" as const, terminal: false, canResume: true };
    case "FAILED_RETRYABLE":
      return { label: "Payment Unsuccessful — Retry Available", tone: "danger" as const, terminal: false, canResume: true };
    case "CANCELLED":
      return { label: "Payment Cancelled", tone: "default" as const, terminal: true, canResume: false };
    case "EXPIRED":
      return { label: "Checkout Expired", tone: "default" as const, terminal: true, canResume: false };
    case "FAILED":
      return { label: "Payment Unsuccessful", tone: "danger" as const, terminal: true, canResume: false };
    case "UNAVAILABLE":
      return { label: "Status Temporarily Unavailable", tone: "warning" as const, terminal: false, canResume: true };
    default:
      return { label: "Awaiting Payment", tone: "warning" as const, terminal: false, canResume: true };
  }
}

export function classifyPayMongoGatewayState(input: {
  localStatus?: string | null;
  reviewRemarks?: string | null;
  checkoutStatus?: string | null;
  paymentIntentStatus?: string | null;
  lastPaymentError?: unknown;
  hasPaidPayment?: boolean;
}): PayMongoGatewayState {
  const localStatus = String(input.localStatus || "").toUpperCase();
  const reviewRemarks = String(input.reviewRemarks || "");
  const checkoutStatus = String(input.checkoutStatus || "").toLowerCase();
  const intentStatus = String(input.paymentIntentStatus || "").toLowerCase();
  const storedState = paymongoGatewayStateFromRemark(reviewRemarks);

  if (localStatus === "APPROVED" || input.hasPaidPayment) return "PAID";
  if (/cancel/i.test(reviewRemarks) || storedState === "CANCELLED") return "CANCELLED";
  if (checkoutStatus === "expired" || storedState === "EXPIRED") return "EXPIRED";
  if (intentStatus === "processing") return "PROCESSING";
  if (intentStatus === "awaiting_next_action") return "AWAITING_ACTION";
  if (intentStatus === "awaiting_payment_method" && Boolean(input.lastPaymentError)) return "FAILED_RETRYABLE";
  if (localStatus === "REJECTED") return storedState || "FAILED";
  if (checkoutStatus === "active" || intentStatus === "awaiting_payment_method") return "AWAITING_PAYMENT";
  return storedState || "UNAVAILABLE";
}
