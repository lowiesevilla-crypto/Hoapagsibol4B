import { DocumentRequestStatus, PaymentRequestStatus } from "@prisma/client";

type MaybeDate = Date | string | null | undefined;

export type DocumentFeePaymentRequestLike = {
  id: string;
  documentNumber?: string | null;
  requestedAt?: MaybeDate;
  paymentRequiredSnapshot: boolean;
  feeAmountSnapshot: unknown;
  status: DocumentRequestStatus | string;
  paymentRequest?: {
    id: string;
    status: PaymentRequestStatus | string;
    referenceNumber?: string | null;
    proofImageUrl?: string | null;
    reviewedAt?: MaybeDate;
    reviewedById?: string | null;
    reviewRemarks?: string | null;
    collection?: { receiptNumber?: string | null; id?: string | null } | null;
    collectionId?: string | null;
    paymentDate?: MaybeDate;
    updatedAt?: MaybeDate;
  } | null;
};

const terminalRequestStatuses = new Set<string>([
  DocumentRequestStatus.CANCELLED,
  DocumentRequestStatus.REJECTED,
  DocumentRequestStatus.REVOKED,
  DocumentRequestStatus.ISSUED,
  DocumentRequestStatus.READY_FOR_DOWNLOAD,
  DocumentRequestStatus.GENERATED,
  DocumentRequestStatus.DOWNLOADED,
]);

export function documentRequestPublicReference(request: { id: string; documentNumber?: string | null; requestedAt?: MaybeDate }) {
  if (request.documentNumber) return request.documentNumber;
  const date = request.requestedAt ? new Date(request.requestedAt) : new Date();
  const year = Number.isFinite(date.valueOf()) ? date.getUTCFullYear() : new Date().getUTCFullYear();
  return `DR-${year}-${request.id.slice(-6).toUpperCase()}`;
}

export function documentFeeAmount(request: Pick<DocumentFeePaymentRequestLike, "feeAmountSnapshot">) {
  const amount = Number(request.feeAmountSnapshot);
  return Number.isFinite(amount) ? amount : 0;
}

export function hasSubmittedDocumentFeePayment(request: DocumentFeePaymentRequestLike) {
  return Boolean(request.paymentRequest?.referenceNumber || request.paymentRequest?.proofImageUrl);
}

export function documentFeePaymentStatusLabel(request: DocumentFeePaymentRequestLike) {
  if (!request.paymentRequiredSnapshot || documentFeeAmount(request) <= 0) return "Not required";
  if (!request.paymentRequest) return "Payment Required";
  if (request.paymentRequest.status === PaymentRequestStatus.APPROVED) return "Payment Confirmed";
  if (request.paymentRequest.status === PaymentRequestStatus.REJECTED) return "Payment Rejected";
  if (request.paymentRequest.status === PaymentRequestStatus.PENDING_REVIEW && hasSubmittedDocumentFeePayment(request)) return "Payment Submitted";
  return "Payment Required";
}

export function canSubmitDocumentFeePayment(request: DocumentFeePaymentRequestLike) {
  if (!request.paymentRequiredSnapshot || documentFeeAmount(request) <= 0) return false;
  if (terminalRequestStatuses.has(String(request.status))) return false;
  if (!request.paymentRequest) return true;
  if (request.paymentRequest.status === PaymentRequestStatus.REJECTED) return true;
  if (request.paymentRequest.status === PaymentRequestStatus.PENDING_REVIEW && !hasSubmittedDocumentFeePayment(request)) return true;
  return false;
}

export function documentFeePaymentPurpose(input: { documentType: string; requestReference: string }) {
  return `Document Request Fee - ${input.documentType}\nRequest No. ${input.requestReference}`;
}
