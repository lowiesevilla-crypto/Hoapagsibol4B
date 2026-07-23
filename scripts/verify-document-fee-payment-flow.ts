import { readFileSync } from "node:fs";
import { DocumentRequestStatus, PaymentRequestStatus } from "@prisma/client";
import { canSubmitDocumentFeePayment, documentFeePaymentStatusLabel, documentRequestPublicReference } from "@/lib/services/document-fee-payments";

function assertCondition(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

function main() {
  const portalDocuments = readFileSync("app/portal/documents/page.tsx", "utf8");
  const portalPay = readFileSync("app/portal/pay/page.tsx", "utf8");
  const qrForm = readFileSync("components/pay-by-qr-form.tsx", "utf8");
  const paymentActions = readFileSync("lib/actions/payment-requests.ts", "utf8");
  const paymentService = readFileSync("lib/services/payment-requests.ts", "utf8");
  const adminPayments = readFileSync("components/admin-payment-sections.tsx", "utf8");
  const adminPaymentDetail = readFileSync("app/admin/payments/requests/[id]/page.tsx", "utf8");
  const adminDocumentDetail = readFileSync("app/admin/documents/[id]/page.tsx", "utf8");
  const schema = readFileSync("prisma/schema.prisma", "utf8");

  assertCondition(schema.includes("DOCUMENT_FEE") && schema.includes("@@unique([tenantId, documentRequestId])"), "schema supports one tenant-scoped document fee payment request per document request");
  assertCondition(portalDocuments.includes("Pay Document Fee") && portalDocuments.includes("DocumentFeePaymentPanel"), "homeowner request list shows the Pay Document Fee entry point");
  assertCondition(portalDocuments.includes("Payment of") && portalDocuments.includes("is required before this document can be generated and downloaded"), "homeowner request list explains the fee lock in business language");
  assertCondition(portalPay.includes("documentRequestId") && portalPay.includes("Tenant payment account") && portalPay.includes("selectedDocumentPayment"), "portal pay page supports document-fee mode with tenant branding");
  assertCondition(qrForm.includes('value="DOCUMENT_FEE"') && qrForm.includes("documentRequestId") && qrForm.includes("isDocumentFee ? null") && qrForm.includes('name="amount"'), "document-fee QR form skips the editable amount field while preserving normal collection payments");
  assertCondition(paymentActions.includes("Document fee amount is controlled by the saved document definition") && paymentActions.includes("homeownerId: user.homeownerProfile.id"), "document fee submission validates saved amount and homeowner ownership server-side");
  assertCondition(paymentActions.includes("tx.paymentRequest.findFirst({ where: { tenantId: user.tenantId, documentRequestId: request.id } })") && paymentActions.includes("tx.paymentRequest.update") && paymentActions.includes("tx.paymentRequest.create"), "document fee submission reuses the existing obligation and creates only when missing");
  assertCondition(paymentService.includes("advanceDocumentWorkflowAfterPayment") && paymentService.includes("APPROVE_DOCUMENT_FEE_PAYMENT") && paymentService.includes("Document fee payment amount does not match"), "Finance approval validates document fee and invokes the workflow executor");
  assertCondition(adminPayments.includes("DOCUMENT_FEE") && adminPayments.includes("Document request") && adminPayments.includes("/admin/documents/"), "admin payment request list labels and links document fee payments");
  assertCondition(adminPaymentDetail.includes("tenantId: admin.tenantId") && adminPaymentDetail.includes("Open document request"), "admin payment detail is tenant-scoped and links to the document request");
  assertCondition(adminDocumentDetail.includes("Document fee payment") && adminDocumentDetail.includes("Open payment request") && adminDocumentDetail.includes("Open receipt"), "admin document request links back to payment and receipt records");

  const base = { id: "cm-test-123456", requestedAt: new Date("2026-07-22T00:00:00Z"), paymentRequiredSnapshot: true, feeAmountSnapshot: 150, status: DocumentRequestStatus.PENDING_PAYMENT };
  assertCondition(documentRequestPublicReference(base) === "DR-2026-123456", "public request reference is stable without exposing the full internal id");
  assertCondition(canSubmitDocumentFeePayment({ ...base, paymentRequest: { id: "pay1", status: PaymentRequestStatus.PENDING_REVIEW } }), "unsubmitted generated payment obligation remains payable");
  assertCondition(!canSubmitDocumentFeePayment({ ...base, paymentRequest: { id: "pay1", status: PaymentRequestStatus.PENDING_REVIEW, referenceNumber: "GC123" } }), "submitted document fee payment cannot be submitted twice");
  assertCondition(canSubmitDocumentFeePayment({ ...base, paymentRequest: { id: "pay1", status: PaymentRequestStatus.REJECTED, referenceNumber: "GC123", reviewRemarks: "Unreadable proof" } }), "rejected document fee payment can be resubmitted");
  assertCondition(!canSubmitDocumentFeePayment({ ...base, status: DocumentRequestStatus.ISSUED, paymentRequest: { id: "pay1", status: PaymentRequestStatus.APPROVED } }), "issued document request cannot be paid again");
  assertCondition(documentFeePaymentStatusLabel({ ...base, paymentRequest: { id: "pay1", status: PaymentRequestStatus.PENDING_REVIEW, referenceNumber: "GC123" } }) === "Payment Submitted", "homeowner label differentiates submitted from confirmed payment");
  assertCondition(documentFeePaymentStatusLabel({ ...base, paymentRequest: { id: "pay1", status: PaymentRequestStatus.APPROVED } }) === "Payment Confirmed", "homeowner label displays confirmed payment");

  console.log("Document fee payment flow verification passed.");
}

main();
