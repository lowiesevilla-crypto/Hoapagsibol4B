import { randomUUID } from "node:crypto";
import { CollectionType, DocumentRequestStatus, PaymentRequestStatus, PaymentRequestType, PayerType, Prisma, RefundStatus, Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { isPayMongoPaymentRequest } from "@/lib/homeowner-payment-flow";
import { buildPaymentCoverage } from "@/lib/payment-coverage";
import { recalculateBillFromActivePayments } from "@/lib/services/payment-ledger";
import { allocateReceiptNumber, collectionReceiptSeries } from "@/lib/services/receipt";
import { documentContextFromUser } from "@/lib/services/document-runtime-context";
import { advanceDocumentWorkflowAfterPayment } from "@/lib/services/document-workflow-executor";
import { monthLabel } from "@/lib/utils";

const refundableTypes = new Set<CollectionType>([CollectionType.CONSTRUCTION_BOND, CollectionType.CONTRACTOR_BOND]);

type ApprovePaymentRequestOptions = {
  allowGatewayConfirmation?: boolean;
};

export async function approvePaymentRequest(requestId: string, reviewerId?: string, reviewRemarks?: string, tenantId?: string, options?: ApprovePaymentRequestOptions) {
  const approved = await platformPrisma.$transaction(async (tx) => {
    const request = tenantId
      ? await tx.paymentRequest.findFirst({ where: { id: requestId, tenantId } })
      : await tx.paymentRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error("Payment request not found.");
    if (request.status !== PaymentRequestStatus.PENDING_REVIEW) throw new Error("This payment request has already been reviewed.");
    if (isPayMongoPaymentRequest(request) && !options?.allowGatewayConfirmation) {
      throw new Error("This PayMongo payment is awaiting verified gateway confirmation and cannot be approved manually.");
    }

    const paymentDate = request.paymentDate;
    if (request.type === PaymentRequestType.MONTHLY_DUES) {
      if (!request.billId) throw new Error("Payment request is missing a bill.");
      const bill = await tx.bill.findUnique({ where: { id: request.billId } });
      if (!bill || bill.tenantId !== request.tenantId || bill.homeownerId !== request.homeownerId) throw new Error("The selected bill does not belong to this homeowner.");
      if (bill.archivedAt && !options?.allowGatewayConfirmation) throw new Error("This billing record has been archived and can no longer accept payments.");
      const amount = Number(request.amount);
      if (request.referenceNumber) {
        const activeDuplicate = await tx.payment.findFirst({ where: { tenantId: request.tenantId, referenceNumber: request.referenceNumber, status: "ACTIVE" }, select: { id: true } });
        if (activeDuplicate) throw new Error("This payment reference number has already been recorded.");
      }
      const balance = Number(bill.balance);
      if (balance <= 0 && !options?.allowGatewayConfirmation) throw new Error("This billing record no longer has an outstanding balance.");
      const appliedAmount = Math.min(amount, Math.max(balance, 0));
      const unappliedCredit = amount - appliedAmount;
      const receiptNumber = await allocateReceiptNumber(tx as unknown as Prisma.TransactionClient, request.tenantId, paymentDate, "MD");
      const coverage = buildPaymentCoverage([bill.billingMonth]);
      const payment = await tx.payment.create({
        data: {
          tenantId: request.tenantId,
          billId: null,
          homeownerId: bill.homeownerId,
          amount,
          paymentDate,
          method: request.method,
          referenceNumber: request.referenceNumber,
          paymentBatchId: randomUUID(),
          idempotencyKey: `payment-request:${request.id}`,
          ...coverage,
          remarks: [request.payerNotes, reviewRemarks].filter(Boolean).join("\n") || null,
          receiptNumber,
          proofUrl: request.proofImageUrl,
          proofFileName: request.proofFileName,
          proofContentType: request.proofContentType,
          proofFileSize: request.proofFileSize,
          processedById: reviewerId ?? null,
        },
      });
      if (appliedAmount > 0) {
        await tx.paymentAllocation.create({ data: { tenantId: request.tenantId, paymentId: payment.id, billId: bill.id, amount: appliedAmount, coverageYear: bill.coverageYear, coverageMonth: bill.coverageMonth, coverageLabel: monthLabel(bill.billingMonth) } });
      }
      const recalculated = appliedAmount > 0
        ? await recalculateBillFromActivePayments(tx as unknown as Prisma.TransactionClient, bill)
        : { skipped: true, reason: "NO_OUTSTANDING_BALANCE_AT_GATEWAY_CONFIRMATION" };
      const reviewer = reviewerId ? await tx.user.findFirst({ where: { id: reviewerId, tenantId: request.tenantId }, select: { id: true, name: true, email: true, role: true } }) : null;
      const replacedVoidedPayments = request.referenceNumber ? await tx.payment.findMany({ where: { tenantId: request.tenantId, referenceNumber: request.referenceNumber, status: "VOIDED" }, select: { id: true, receiptNumber: true } }) : [];
      await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: reviewerId ?? null, module: "PAYMENTS", action: "RECORD_PAYMENT_TRANSACTION", entityType: "Payment", entityId: payment.id, metadata: { receiptNumber, source: isPayMongoPaymentRequest(request) ? "PAYMONGO_HOMEOWNER" : "PAYMENT_REQUEST", paymentType: "MONTHLY_DUES", totalAmount: amount, appliedAmount, unappliedCredit, allocations: appliedAmount > 0 ? [{ billId: bill.id, amount: appliedAmount, coverage: monthLabel(bill.billingMonth) }] : [], coverageStart: coverage.coverageStart, coverageEnd: coverage.coverageEnd, coverageMonths: coverage.coverageMonths, paymentCoverageDisplay: coverage.paymentCoverageDisplay, homeownerId: bill.homeownerId, adminUser: reviewer, replacesVoidedPayments: replacedVoidedPayments, recalculated, timestamp: new Date().toISOString() } } });
      const approved = await tx.paymentRequest.update({
        where: { id: request.id },
        data: { status: PaymentRequestStatus.APPROVED, reviewedById: reviewerId ?? null, reviewedAt: new Date(), reviewRemarks: reviewRemarks || null, paymentId: payment.id },
      });
      await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: reviewerId ?? null, module: "PAYMENTS", action: "APPROVE_PAYMENT_REQUEST", entityType: "PaymentRequest", entityId: request.id, metadata: { oldValue: { status: request.status }, newValue: { status: "APPROVED", paymentId: payment.id, receiptNumber }, remarks: reviewRemarks, gatewayConfirmed: Boolean(options?.allowGatewayConfirmation), recordedAsUnappliedCredit: appliedAmount === 0 && options?.allowGatewayConfirmation === true } } });
      return approved;
    }

    if (request.type === PaymentRequestType.DOCUMENT_FEE) {
      if (!request.documentRequestId) throw new Error("Document fee payment request is missing its document request.");
      const documentRequest = await tx.documentRequest.findFirst({ where: { tenantId: request.tenantId, id: request.documentRequestId, homeownerId: request.homeownerId }, select: { id: true, paymentRequiredSnapshot: true, feeAmountSnapshot: true, status: true } });
      if (!documentRequest) throw new Error("Linked document request was not found for this tenant.");
      if (!documentRequest.paymentRequiredSnapshot) throw new Error("The linked document request does not require a document fee.");
      const terminalDocumentStatuses: DocumentRequestStatus[] = [DocumentRequestStatus.CANCELLED, DocumentRequestStatus.REJECTED, DocumentRequestStatus.REVOKED, DocumentRequestStatus.ISSUED, DocumentRequestStatus.READY_FOR_DOWNLOAD, DocumentRequestStatus.GENERATED, DocumentRequestStatus.DOWNLOADED];
      if (terminalDocumentStatuses.includes(documentRequest.status)) {
        throw new Error("The linked document request can no longer accept payment confirmation.");
      }
      if (Math.abs(Number(request.amount) - Number(documentRequest.feeAmountSnapshot)) > 0.009) throw new Error("Document fee payment amount does not match the saved document request fee.");
      const adminId = reviewerId ?? (await tx.user.findFirst({ where: { tenantId: request.tenantId, role: { in: [Role.SYSTEM_ADMIN, Role.ADMIN, Role.HOA_ADMIN] } }, select: { id: true } }))?.id;
      if (!adminId) throw new Error("No tenant administrator account is available to record this document collection.");
      const receiptNumber = await allocateReceiptNumber(tx as unknown as Prisma.TransactionClient, request.tenantId, paymentDate, "OC");
      const collection = await tx.collection.create({
        data: {
          tenantId: request.tenantId,
          type: CollectionType.OTHER,
          description: request.description || "Document fee",
          payerType: PayerType.HOMEOWNER,
          homeownerId: request.homeownerId,
          amount: request.amount,
          collectionDate: paymentDate,
          method: request.method,
          referenceNumber: request.referenceNumber,
          receiptNumber,
          remarks: [request.payerNotes, reviewRemarks].filter(Boolean).join("\n") || null,
          refundable: false,
          refundStatus: RefundStatus.NOT_APPLICABLE,
          createdById: adminId,
        },
      });
      await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: adminId, module: "RECEIPTS", action: "GENERATE_OC_RECEIPT", entityType: "Collection", entityId: collection.id, metadata: { receiptNumber, source: isPayMongoPaymentRequest(request) ? "PAYMONGO_DOCUMENT_FEE" : "DOCUMENT_FEE_PAYMENT_REQUEST", documentRequestId: request.documentRequestId } } });
      const updatedDocument = await tx.documentRequest.update({ where: { id: documentRequest.id }, data: { status: DocumentRequestStatus.PAYMENT_CONFIRMED } });
      await tx.documentRequestHistory.create({ data: { tenantId: request.tenantId, requestId: documentRequest.id, status: DocumentRequestStatus.PAYMENT_CONFIRMED, actorId: adminId, note: `Document fee confirmed with receipt ${receiptNumber}.` } });
      const approved = await tx.paymentRequest.update({
        where: { id: request.id },
        data: { status: PaymentRequestStatus.APPROVED, reviewedById: reviewerId ?? null, reviewedAt: new Date(), reviewRemarks: reviewRemarks || null, collectionId: collection.id },
      });
      await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: adminId, module: "PAYMENTS", action: "APPROVE_DOCUMENT_FEE_PAYMENT", entityType: "PaymentRequest", entityId: request.id, metadata: { oldValue: { status: request.status, documentStatus: documentRequest.status }, newValue: { status: "APPROVED", documentStatus: updatedDocument.status, collectionId: collection.id, receiptNumber }, documentRequestId: documentRequest.id, remarks: reviewRemarks, gatewayConfirmed: Boolean(options?.allowGatewayConfirmation) } } });
      return approved;
    }

    if (!request.collectionType) throw new Error("Payment request is missing a collection type.");
    if (request.collectionType === CollectionType.CONTRACTOR_BOND) throw new Error("Contractor bonds must be recorded from a contractor profile.");
    const adminId = reviewerId ?? (await tx.user.findFirst({ where: { tenantId: request.tenantId, role: { in: [Role.SYSTEM_ADMIN, Role.ADMIN, Role.HOA_ADMIN] } }, select: { id: true } }))?.id;
    if (!adminId) throw new Error("No administrator account is available to record this collection.");
    const refundable = refundableTypes.has(request.collectionType);
    const series = collectionReceiptSeries(request.collectionType);
    const receiptNumber = await allocateReceiptNumber(tx as unknown as Prisma.TransactionClient, request.tenantId, paymentDate, series);
    const collection = await tx.collection.create({
      data: {
        tenantId: request.tenantId,
        type: request.collectionType,
        description: request.description || null,
        payerType: PayerType.HOMEOWNER,
        homeownerId: request.homeownerId,
        amount: request.amount,
        collectionDate: paymentDate,
        method: request.method,
        referenceNumber: request.referenceNumber,
        receiptNumber,
        remarks: [request.payerNotes, reviewRemarks].filter(Boolean).join("\n") || null,
        refundable,
        refundStatus: refundable ? RefundStatus.HELD : RefundStatus.NOT_APPLICABLE,
        createdById: adminId,
      },
    });
    await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: adminId, module: "RECEIPTS", action: `GENERATE_${series}_RECEIPT`, entityType: "Collection", entityId: collection.id, metadata: { receiptNumber, source: isPayMongoPaymentRequest(request) ? "PAYMONGO_HOMEOWNER" : "PAYMENT_REQUEST" } } });
    const approved = await tx.paymentRequest.update({
      where: { id: request.id },
      data: { status: PaymentRequestStatus.APPROVED, reviewedById: reviewerId ?? null, reviewedAt: new Date(), reviewRemarks: reviewRemarks || null, collectionId: collection.id },
    });
    await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: adminId, module: "PAYMENTS", action: "APPROVE_PAYMENT_REQUEST", entityType: "PaymentRequest", entityId: request.id, metadata: { oldValue: { status: request.status }, newValue: { status: "APPROVED", collectionId: collection.id, receiptNumber }, remarks: reviewRemarks, gatewayConfirmed: Boolean(options?.allowGatewayConfirmation) } } });
    return approved;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (approved.type === PaymentRequestType.DOCUMENT_FEE && approved.documentRequestId) {
    const reviewer = reviewerId
      ? await platformPrisma.user.findFirst({ where: { id: reviewerId, tenantId: approved.tenantId } })
      : await platformPrisma.user.findFirst({ where: { tenantId: approved.tenantId, active: true, role: { in: [Role.SYSTEM_ADMIN, Role.ADMIN, Role.HOA_ADMIN] } } });
    if (reviewer) await advanceDocumentWorkflowAfterPayment(documentContextFromUser(reviewer), approved.documentRequestId);
  }
  return approved;
}

export async function rejectPaymentRequest(requestId: string, reviewerId: string, reviewRemarks?: string, tenantId?: string) {
  return platformPrisma.$transaction(async (tx) => {
    const request = tenantId
      ? await tx.paymentRequest.findFirst({ where: { id: requestId, tenantId } })
      : await tx.paymentRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error("Payment request not found.");
    if (request.status !== PaymentRequestStatus.PENDING_REVIEW) throw new Error("This payment request has already been reviewed.");
    if (isPayMongoPaymentRequest(request)) throw new Error("PayMongo payment requests are controlled by the payment gateway and cannot be manually rejected while awaiting confirmation.");
    const rejected = await tx.paymentRequest.update({
      where: { id: requestId },
      data: { status: PaymentRequestStatus.REJECTED, reviewedById: reviewerId, reviewedAt: new Date(), reviewRemarks: reviewRemarks || "Rejected by administrator." },
    });
    await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: reviewerId, module: "PAYMENTS", action: "REJECT_PAYMENT_REQUEST", entityType: "PaymentRequest", entityId: request.id, metadata: { oldValue: { status: request.status }, newValue: { status: "REJECTED" }, remarks: reviewRemarks } } });
    return rejected;
  });
}
