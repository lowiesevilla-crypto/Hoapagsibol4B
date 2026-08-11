export type HomeownerPaymentStatusTone = "default" | "warning" | "danger" | "success";

type HomeownerPaymentStatusInput = {
  hasBills: boolean;
  balance: number;
  collectionStatus: string;
  hasPending: boolean;
  hasRejected: boolean;
};

export function resolveHomeownerPaymentStatus({
  hasBills,
  balance,
  collectionStatus,
  hasPending,
  hasRejected,
}: HomeownerPaymentStatusInput): { label: string; tone: HomeownerPaymentStatusTone } {
  if (!hasBills) return { label: "No Billing Record", tone: "default" };

  // The Statement of Account balance is the financial source of truth. A prior
  // rejected attempt remains in history, but must not override a later payment
  // that has already settled the homeowner's outstanding balance.
  if (balance <= 0) return { label: "Fully Paid", tone: "success" };

  if (hasPending) return { label: "Payment Pending", tone: "warning" };
  if (hasRejected) return { label: "Payment Rejected", tone: "danger" };
  if (collectionStatus === "Overdue") return { label: "Overdue", tone: "danger" };
  return { label: "Amount Due", tone: "warning" };
}
