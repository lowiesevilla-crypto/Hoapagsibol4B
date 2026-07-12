import { randomUUID } from "node:crypto";
import { CollectionType, PaymentRequestStatus, PaymentRequestType, PayerType, Prisma, RefundStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildPaymentCoverage } from "@/lib/payment-coverage";
import { recalculateBillFromActivePayments } from "@/lib/services/payment-ledger";
import { allocateReceiptNumber, collectionReceiptSeries } from "@/lib/services/receipt";
import { monthLabel } from "@/lib/utils";

const refundableTypes = new Set<CollectionType>([CollectionType.CONSTRUCTION_BOND, CollectionType.CONTRACTOR_BOND]);

export async function approvePaymentRequest(requestId: string, reviewerId?: string, reviewRemarks?: string, tenantId?: string) {
  return prisma.$transaction(async (tx) => {
    const request = tenantId
      ? await tx.paymentRequest.findFirst({ where: { id: requestId, tenantId } })
      : await tx.paymentRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error("Payment request not found.");
    if (request.status !== PaymentRequestStatus.PENDING_REVIEW) throw new Error("This payment request has already been reviewed.");

    const paymentDate = request.paymentDate;
    if (request.type === PaymentRequestType.MONTHLY_DUES) {
      if (!request.billId) throw new Error("Payment request is missing a bill.");
      const bill = await tx.bill.findUnique({ where: { id: request.billId } });
      if (!bill || bill.tenantId !== request.tenantId || bill.homeownerId !== request.homeownerId) throw new Error("The selected bill does not belong to this homeowner.");
      if (bill.archivedAt) throw new Error("This billing record has been archived and can no longer accept payments.");
      const amount = Number(request.amount);
      const balance = Number(bill.balance);
      if (amount > balance) throw new Error("Payment request exceeds the current bill balance.");
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
      await tx.paymentAllocation.create({ data: { tenantId: request.tenantId, paymentId: payment.id, billId: bill.id, amount, coverageYear: bill.coverageYear, coverageMonth: bill.coverageMonth, coverageLabel: monthLabel(bill.billingMonth) } });
      const recalculated = await recalculateBillFromActivePayments(tx as unknown as Prisma.TransactionClient, bill);
      await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: reviewerId ?? null, module: "PAYMENTS", action: "RECORD_PAYMENT_TRANSACTION", entityType: "Payment", entityId: payment.id, metadata: { receiptNumber, source: "PAYMENT_REQUEST", paymentType: "MONTHLY_DUES", totalAmount: amount, allocations: [{ billId: bill.id, amount, coverage: monthLabel(bill.billingMonth) }], coverageStart: coverage.coverageStart, coverageEnd: coverage.coverageEnd, coverageMonths: coverage.coverageMonths, paymentCoverageDisplay: coverage.paymentCoverageDisplay, homeownerId: bill.homeownerId, adminUserId: reviewerId ?? null, recalculated, timestamp: new Date().toISOString() } } });
      const approved = await tx.paymentRequest.update({
        where: { id: request.id },
        data: { status: PaymentRequestStatus.APPROVED, reviewedById: reviewerId ?? null, reviewedAt: new Date(), reviewRemarks: reviewRemarks || null, paymentId: payment.id },
      });
      await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: reviewerId ?? null, module: "PAYMENTS", action: "APPROVE_PAYMENT_REQUEST", entityType: "PaymentRequest", entityId: request.id, metadata: { oldValue: { status: request.status }, newValue: { status: "APPROVED", paymentId: payment.id, receiptNumber }, remarks: reviewRemarks } } });
      return approved;
    }

    if (!request.collectionType) throw new Error("Payment request is missing a collection type.");
    if (request.collectionType === CollectionType.CONTRACTOR_BOND) throw new Error("Contractor bonds must be recorded from a contractor profile.");
    const adminId = reviewerId ?? (await tx.user.findFirst({ where: { role: { in: [Role.SYSTEM_ADMIN, Role.ADMIN] } }, select: { id: true } }))?.id;
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
    await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: adminId, module: "RECEIPTS", action: `GENERATE_${series}_RECEIPT`, entityType: "Collection", entityId: collection.id, metadata: { receiptNumber, source: "PAYMENT_REQUEST" } } });
    const approved = await tx.paymentRequest.update({
      where: { id: request.id },
      data: { status: PaymentRequestStatus.APPROVED, reviewedById: reviewerId ?? null, reviewedAt: new Date(), reviewRemarks: reviewRemarks || null, collectionId: collection.id },
    });
    await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: adminId, module: "PAYMENTS", action: "APPROVE_PAYMENT_REQUEST", entityType: "PaymentRequest", entityId: request.id, metadata: { oldValue: { status: request.status }, newValue: { status: "APPROVED", collectionId: collection.id, receiptNumber }, remarks: reviewRemarks } } });
    return approved;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function rejectPaymentRequest(requestId: string, reviewerId: string, reviewRemarks?: string, tenantId?: string) {
  return prisma.$transaction(async (tx) => {
    const request = tenantId
      ? await tx.paymentRequest.findFirst({ where: { id: requestId, tenantId } })
      : await tx.paymentRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error("Payment request not found.");
    if (request.status !== PaymentRequestStatus.PENDING_REVIEW) throw new Error("This payment request has already been reviewed.");
    const rejected = await tx.paymentRequest.update({
      where: { id: requestId },
      data: { status: PaymentRequestStatus.REJECTED, reviewedById: reviewerId, reviewedAt: new Date(), reviewRemarks: reviewRemarks || "Rejected by administrator." },
    });
    await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: reviewerId, module: "PAYMENTS", action: "REJECT_PAYMENT_REQUEST", entityType: "PaymentRequest", entityId: request.id, metadata: { oldValue: { status: request.status }, newValue: { status: "REJECTED" }, remarks: reviewRemarks } } });
    return rejected;
  });
}
