import { BillStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { paymentAppliedAmount, paymentUnappliedCredit } from "@/lib/payment-credit";
import { monthLabel } from "@/lib/utils";

type PaymentActor = { id: string; tenantId: string; name: string; email: string };
type BillForRecalculation = { id: string; totalAmount: Prisma.Decimal; dueDate: Date };

export async function updatePaymentAmountLedger({ paymentId, amount, actor, reason }: { paymentId: string; amount: number; actor: PaymentActor; reason?: string }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, tenantId: actor.tenantId },
      include: { bill: true, allocations: { include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } }, homeowner: { include: { user: true } } },
    });
    if (!payment) throw new Error("Payment record not found.");
    if (payment.status !== "ACTIVE") throw new Error("Voided payments cannot be changed.");
    const previousAmount = Number(payment.amount);
    const previousAppliedAmount = paymentAppliedAmount(payment);
    const previousUnappliedCredit = paymentUnappliedCredit(payment);
    if (Math.abs(previousAmount - amount) < 0.005) throw new Error("The payment amount has not changed.");

    const currentAllocations = payment.allocations.length
      ? payment.allocations.map((allocation) => ({ bill: allocation.bill, amount: Number(allocation.amount) }))
      : payment.bill
        ? [{ bill: payment.bill, amount: previousAmount }]
        : [];

    if (!currentAllocations.length) {
      await tx.payment.update({ where: { id: paymentId }, data: { amount } });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.id,
          module: "PAYMENTS",
          action: "UPDATE_ADVANCE_PAYMENT_AMOUNT",
          entityType: "Payment",
          entityId: payment.id,
          metadata: {
            previousAmount,
            newAmount: amount,
            previousAppliedAmount: 0,
            newAppliedAmount: 0,
            previousUnappliedCredit,
            newUnappliedCredit: roundMoney(amount),
            updatedBy: { id: actor.id, name: actor.name, email: actor.email },
            updatedAt: new Date().toISOString(),
            reason: reason || null,
            homeowner: payment.homeowner.user.name,
            recalculated: [],
          },
        },
      });
      return { paymentId: payment.id, billIds: [], previousAmount, newAmount: amount, recalculated: [] };
    }

    const allocationPlan = redistributeAmount(currentAllocations, amount);
    const newAppliedAmount = roundMoney(allocationPlan.reduce((sum, allocation) => sum + allocation.amount, 0));
    const newUnappliedCredit = roundMoney(amount - newAppliedAmount);
    await tx.payment.update({ where: { id: paymentId }, data: { amount } });
    await tx.paymentAllocation.deleteMany({ where: { tenantId: actor.tenantId, paymentId } });
    await tx.paymentAllocation.createMany({
      data: allocationPlan.map((allocation) => ({
        tenantId: actor.tenantId,
        paymentId,
        billId: allocation.bill.id,
        amount: allocation.amount,
        coverageYear: allocation.bill.coverageYear,
        coverageMonth: allocation.bill.coverageMonth,
        coverageLabel: monthLabel(allocation.bill.billingMonth),
      })),
    });

    const affectedBills = uniqueBills(currentAllocations.map((allocation) => allocation.bill));
    const recalculated = [];
    for (const bill of affectedBills) recalculated.push({ billId: bill.id, ...(await recalculateBillFromActivePayments(tx as unknown as Prisma.TransactionClient, bill)) });

    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.id,
        module: "PAYMENTS",
        action: "UPDATE_PAYMENT_AMOUNT",
        entityType: "Payment",
        entityId: payment.id,
        metadata: {
          previousAmount,
          newAmount: amount,
          previousAppliedAmount,
          newAppliedAmount,
          previousUnappliedCredit,
          newUnappliedCredit,
          previousAllocations: currentAllocations.map((allocation) => ({ billId: allocation.bill.id, amount: allocation.amount })),
          newAllocations: allocationPlan.map((allocation) => ({ billId: allocation.bill.id, amount: allocation.amount })),
          updatedBy: { id: actor.id, name: actor.name, email: actor.email },
          updatedAt: new Date().toISOString(),
          reason: reason || null,
          homeowner: payment.homeowner.user.name,
          recalculated,
        },
      },
    });
    return { paymentId: payment.id, billIds: affectedBills.map((bill) => bill.id), previousAmount, newAmount: amount, recalculated };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function voidPaymentLedger({ paymentId, actor, reason }: { paymentId: string; actor: PaymentActor; reason?: string }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, tenantId: actor.tenantId },
      include: { bill: true, allocations: { include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } }, homeowner: { include: { user: true } }, paymentRequest: true },
    });
    if (!payment) throw new Error("Payment record not found.");
    if (payment.status !== "ACTIVE") throw new Error("This payment has already been voided.");

    const allocations = payment.allocations.length
      ? payment.allocations.map((allocation) => ({ bill: allocation.bill, amount: Number(allocation.amount) }))
      : payment.bill
        ? [{ bill: payment.bill, amount: Number(payment.amount) }]
        : [];
    const affectedBills = uniqueBills(allocations.map((allocation) => allocation.bill));
    const primaryBill = affectedBills[0];
    const voidedAt = new Date();

    const archive = primaryBill ? await tx.paymentArchive.create({
      data: {
        tenantId: actor.tenantId,
        originalPaymentId: payment.id,
        billId: primaryBill.id,
        billingMonth: primaryBill.billingMonth,
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
    }) : null;

    await tx.payment.update({ where: { id: paymentId }, data: { status: "VOIDED", voidedAt, voidedById: actor.id, voidReason: reason || null } });
    if (payment.paymentRequest) {
      await tx.paymentRequest.update({
        where: { id: payment.paymentRequest.id },
        data: { paymentId: null, status: "REJECTED", reviewedById: actor.id, reviewedAt: voidedAt, reviewRemarks: [payment.paymentRequest.reviewRemarks, `Associated payment was voided${reason ? `: ${reason}` : "."}`].filter(Boolean).join("\n") },
      });
    }

    const recalculated = [];
    for (const bill of affectedBills) recalculated.push({ billId: bill.id, ...(await recalculateBillFromActivePayments(tx as unknown as Prisma.TransactionClient, bill)) });
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.id,
        module: "PAYMENTS",
        action: allocations.length ? "VOID_PAYMENT_TRANSACTION" : "VOID_ADVANCE_PAYMENT_TRANSACTION",
        entityType: archive ? "PaymentArchive" : "Payment",
        entityId: archive?.id ?? payment.id,
        metadata: {
          originalPaymentId: payment.id,
          receiptNumber: payment.receiptNumber,
          homeowner: payment.homeowner.user.name,
          amount: Number(payment.amount),
          appliedAmount: paymentAppliedAmount(payment),
          unappliedCreditReversed: paymentUnappliedCredit(payment),
          allocations: allocations.map((allocation) => ({ billId: allocation.bill.id, amount: allocation.amount, coverage: monthLabel(allocation.bill.billingMonth) })),
          referenceNumber: payment.referenceNumber,
          reason: reason || null,
          voidedBy: { id: actor.id, name: actor.name, email: actor.email },
          voidedAt: voidedAt.toISOString(),
          recalculated,
        },
      },
    });
    return { paymentId: payment.id, homeownerId: payment.homeownerId, archiveId: archive?.id ?? null, billIds: affectedBills.map((bill) => bill.id), recalculated };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function recalculateBillFromActivePayments(tx: Prisma.TransactionClient, bill: BillForRecalculation) {
  const [allocated, legacy] = await Promise.all([
    tx.paymentAllocation.aggregate({ where: { billId: bill.id, payment: { status: "ACTIVE" } }, _sum: { amount: true } }),
    tx.payment.aggregate({ where: { billId: bill.id, status: "ACTIVE", allocations: { none: {} } }, _sum: { amount: true } }),
  ]);
  const amountPaid = roundMoney(Number(allocated._sum.amount ?? 0) + Number(legacy._sum.amount ?? 0));
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

function redistributeAmount<T extends { id: string; balance: Prisma.Decimal; billingMonth: Date; coverageYear: number; coverageMonth: number }>(current: Array<{ bill: T; amount: number }>, total: number) {
  if (total <= 0) throw new Error("Payment amount must be greater than zero.");
  let remaining = roundMoney(total);
  const plan: Array<{ bill: T; amount: number }> = [];
  for (const allocation of current) {
    if (remaining <= 0) break;
    const capacity = roundMoney(Number(allocation.bill.balance) + allocation.amount);
    const nextAmount = roundMoney(Math.min(remaining, capacity));
    if (nextAmount > 0) plan.push({ bill: allocation.bill, amount: nextAmount });
    remaining = roundMoney(remaining - nextAmount);
  }
  return plan;
}

function uniqueBills<T extends { id: string }>(bills: T[]) {
  return [...new Map(bills.map((bill) => [bill.id, bill])).values()];
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
