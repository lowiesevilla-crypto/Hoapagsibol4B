import { BillStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type PaymentActor = { id: string; name: string; email: string };

export async function updatePaymentAmountLedger({ paymentId, amount, actor, reason }: { paymentId: string; amount: number; actor: PaymentActor; reason?: string }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { bill: true, homeowner: { include: { user: true } } } });
    if (!payment) throw new Error("Payment record not found.");
    if (payment.status !== "ACTIVE") throw new Error("Voided payments cannot be changed.");
    const previousAmount = Number(payment.amount);
    if (Math.abs(previousAmount - amount) < 0.005) throw new Error("The payment amount has not changed.");
    await tx.payment.update({ where: { id: paymentId }, data: { amount } });
    const recalculated = await recalculateBillFromActivePayments(tx as unknown as Prisma.TransactionClient, payment.bill);
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        module: "PAYMENTS",
        action: "UPDATE_PAYMENT_AMOUNT",
        entityType: "Payment",
        entityId: payment.id,
        metadata: {
          previousAmount,
          newAmount: amount,
          updatedBy: { id: actor.id, name: actor.name, email: actor.email },
          updatedAt: new Date().toISOString(),
          reason: reason || null,
          billId: payment.billId,
          homeowner: payment.homeowner.user.name,
          recalculated,
        },
      },
    });
    return { paymentId: payment.id, billId: payment.billId, previousAmount, newAmount: amount, recalculated };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function voidPaymentLedger({ paymentId, actor, reason }: { paymentId: string; actor: PaymentActor; reason?: string }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { bill: true, homeowner: { include: { user: true } }, paymentRequest: true },
    });
    if (!payment) throw new Error("Payment record not found.");
    if (payment.status !== "ACTIVE") throw new Error("This payment has already been voided.");
    const voidedAt = new Date();
    const archive = await tx.paymentArchive.create({
      data: {
        originalPaymentId: payment.id,
        billId: payment.billId,
        billingMonth: payment.bill.billingMonth,
        homeownerId: payment.homeownerId,
        homeownerName: payment.homeowner.user.name,
        homeownerAddress: payment.homeowner.address,
        property: `Block ${payment.homeowner.block}, Lot ${payment.homeowner.lot}`,
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        method: payment.method,
        referenceNumber: payment.referenceNumber,
        paymentBatchId: payment.paymentBatchId,
        coverageStart: payment.coverageStart,
        coverageEnd: payment.coverageEnd,
        coverageMonths: payment.coverageMonths ?? undefined,
        coverageFromMonth: payment.coverageFromMonth,
        coverageFromYear: payment.coverageFromYear,
        coverageToMonth: payment.coverageToMonth,
        coverageToYear: payment.coverageToYear,
        paymentCoverageDisplay: payment.paymentCoverageDisplay,
        receiptNumber: payment.receiptNumber,
        remarks: payment.remarks,
        proofUrl: payment.proofUrl,
        proofFileName: payment.proofFileName,
        proofContentType: payment.proofContentType,
        proofFileSize: payment.proofFileSize,
        originalCreatedAt: payment.createdAt,
        voidedById: actor.id,
        voidedAt,
        voidReason: reason || null,
      },
    });
    await tx.payment.update({ where: { id: paymentId }, data: { status: "VOIDED", voidedAt, voidedById: actor.id, voidReason: reason || null } });
    if (payment.paymentRequest) {
      await tx.paymentRequest.update({
        where: { id: payment.paymentRequest.id },
        data: { paymentId: null, status: "REJECTED", reviewedById: actor.id, reviewedAt: voidedAt, reviewRemarks: [payment.paymentRequest.reviewRemarks, `Associated payment was voided${reason ? `: ${reason}` : "."}`].filter(Boolean).join("\n") },
      });
    }
    const recalculated = await recalculateBillFromActivePayments(tx as unknown as Prisma.TransactionClient, payment.bill);
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        module: "PAYMENTS",
        action: "VOID_PAYMENT_TRANSACTION",
        entityType: "PaymentArchive",
        entityId: archive.id,
        metadata: { originalPaymentId: payment.id, billId: payment.billId, homeowner: payment.homeowner.user.name, amount: Number(payment.amount), referenceNumber: payment.referenceNumber, reason: reason || null, voidedBy: { id: actor.id, name: actor.name, email: actor.email }, voidedAt: voidedAt.toISOString(), recalculated },
      },
    });
    return { paymentId: payment.id, archiveId: archive.id, billId: payment.billId, recalculated };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function recalculateBillFromActivePayments(tx: Prisma.TransactionClient, bill: { id: string; totalAmount: Prisma.Decimal; dueDate: Date }) {
  const totals = await tx.payment.aggregate({ where: { billId: bill.id, status: "ACTIVE" }, _sum: { amount: true } });
  const amountPaid = roundMoney(Number(totals._sum.amount ?? 0));
  const balance = roundMoney(Math.max(0, Number(bill.totalAmount) - amountPaid));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const status = balance <= 0
    ? BillStatus.PAID
    : amountPaid > 0
      ? bill.dueDate < today ? BillStatus.OVERDUE : BillStatus.PARTIAL
      : bill.dueDate < today ? BillStatus.OVERDUE : BillStatus.UNPAID;
  await tx.bill.update({ where: { id: bill.id }, data: { amountPaid, balance, status } });
  return { amountPaid, unpaidAmount: balance, status };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
