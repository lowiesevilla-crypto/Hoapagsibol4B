export type HomeownerPaymentStatusTone = "default" | "warning" | "danger" | "success";

type HomeownerPaymentStatusInput = {
  hasBills: boolean;
  balance: number;
  collectionStatus: string;
  hasPending: boolean;
  hasRejected: boolean;
};

type HomeownerPaymentRequestDisplayInput = {
  requestStatus: string;
  onlineRequest: boolean;
  hasPostedPayment: boolean;
};

export function resolveHomeownerPaymentStatus({
  hasBills,
  balance,
  collectionStatus,
  hasPending,
  hasRejected,
}: HomeownerPaymentStatusInput): { label: string; tone: HomeownerPaymentStatusTone } {
  if (!hasBills) return { label: "No Billing Record", tone: "default" };

  // The posted Statement of Account is the current financial source of truth.
  // A rejected/cancelled attempt is historical and must never override a later
  // verified payment that has already settled the homeowner balance.
  if (balance <= 0) return { label: "Fully Paid", tone: "success" };

  if (hasPending) return { label: "Payment Pending", tone: "warning" };
  if (hasRejected) return { label: "Payment Rejected", tone: "danger" };
  if (collectionStatus === "Overdue") return { label: "Overdue", tone: "danger" };
  return { label: "Amount Due", tone: "warning" };
}

export function resolveHomeownerPaymentRequestDisplayStatus({
  requestStatus,
  onlineRequest,
  hasPostedPayment,
}: HomeownerPaymentRequestDisplayInput): { label: string; tone: HomeownerPaymentStatusTone } {
  // A linked posted Payment/Collection is stronger evidence than a stale request
  // status. PayMongo requests are only posted after verified gateway confirmation.
  if (hasPostedPayment) return { label: onlineRequest ? "Paid · PayMongo confirmed" : "Approved", tone: "success" };
  if (onlineRequest && requestStatus === "PENDING_REVIEW") return { label: "Awaiting PayMongo", tone: "warning" };
  if (requestStatus === "APPROVED") return { label: "Approved", tone: "success" };
  if (requestStatus === "REJECTED") return { label: "Payment Rejected", tone: "danger" };
  if (requestStatus === "PENDING_REVIEW") return { label: "Pending Review", tone: "warning" };
  if (requestStatus === "CANCELLED" || requestStatus === "CANCELED") return { label: "Payment Cancelled", tone: "default" };
  return { label: requestStatus.replaceAll("_", " "), tone: "default" };
}
