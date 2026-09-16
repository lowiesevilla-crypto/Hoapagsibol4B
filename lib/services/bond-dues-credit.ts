import { randomUUID } from "node:crypto";
import { CollectionType, PaymentMethod, Prisma, RecurringChargeType, RefundStatus } from "@prisma/client";
import { bondDuesCreditBatchId, bondDuesCreditBatchPrefix, bondDuesCreditCollectionId, isBondDuesCreditPayment } from "@/lib/bond-dues-credit";
import { prisma } from "@/lib/db";
import { buildPaymentCoverage } from "@/lib/payment-coverage";
import { recalculateBillFromActivePayments } from "@/lib/services/payment-ledger";
import { allocateReceiptNumber } from "@/lib/services/receipt";
import { currentTenantContext } from "@/lib/tenant-context";
import { monthLabel } from "@/lib/utils";

export type BondDuesCreditActor = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
};

export type ApplyConstructionBondToDuesInput = {
  collectionId: string;
  amount: number;
  applicationDate: Date;
  idempotencyKey: string;
  authorizationReference?: string | null;
  remarks?: string | null;
  actor: BondDuesCreditActor;
};

export async function applyConstructionBondToMonthlyDues({
  collectionId,
  amount,
  applicationDate,
  idempotencyKey,
  authorizationReference,
  remarks,
  actor,
}: ApplyConstructionBondToDuesInput) {
  const context = currentTenantContext();
  if (!context || context.platform || context.tenantId !== actor.tenantId) {
    throw new Error("Tenant-scoped bond credit context is required.");
  }
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Bond credit amount must be greater than zero.");
  if (Number.isNaN(applicationDate.getTime())) throw new Error("Choose a valid application date.");
  if (!idempotencyKey || idempotencyKey.length > 100) throw new Error("Bond credit submission token is invalid. Refresh the form and try again.");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findFirst({
      where: { tenantId: actor.tenantId, idempotencyKey },
      include: { allocations: true },
    });
    if (existing) {
      if (!isBondDuesCreditPayment(existing) || bondDuesCreditCollectionId(existing) !== collectionId) {
        throw new Error("This submission token is already used by another transaction.");
      }
      return {
        paymentId: existing.id,
        receiptNumber: existing.receiptNumber,
        amount: Number(existing.amount),
        appliedAmount: roundCurrency(existing.allocations.reduce((sum, item) => sum + Number(item.amount), 0)),
        remainingBond: null,
        reused: true,
      };
    }

    const collection = await tx.collection.findFirst({
      where: { id: collectionId, tenantId: actor.tenantId },
      select: {
        id: true,
        type: true,
        homeownerId: true,
        amount: true,
        amountRefunded: true,
        amountForfeited: true,
        receiptNumber: true,
        refundStatus: true,
      },
    });
    if (!collection || collection.type !== CollectionType.CONSTRUCTION_BOND || !collection.homeownerId) {
      throw new Error("Eligible homeowner Construction Bond not found.");
    }
    if (collection.refundStatus === RefundStatus.FORFEITED) throw new Error("This Construction Bond has been forfeited and cannot be applied to dues.");

    const appliedAggregate = await tx.payment.aggregate({
      where: {
        tenantId: actor.tenantId,
        status: "ACTIVE",
        paymentBatchId: { startsWith: bondDuesCreditBatchPrefix(collection.id) },
      },
      _sum: { amount: true },
    });
    const previouslyApplied = roundCurrency(Number(appliedAggregate._sum.amount ?? 0));
    const availableBond = roundCurrency(Number(collection.amount) - Number(collection.amountRefunded) - Number(collection.amountForfeited) - previouslyApplied);
    if (availableBond <= 0) throw new Error("No Construction Bond balance remains to apply to Monthly Dues.");
    if (amount > availableBond) throw new Error("Bond credit cannot exceed the remaining Construction Bond balance.");

    const bills = await tx.bill.findMany({
      where: {
        tenantId: actor.tenantId,
        homeownerId: collection.homeownerId,
        balance: { gt: 0 },
        archivedAt: null,
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
      },
      orderBy: [{ billingMonth: "asc" }, { dueDate: "asc" }],
    });
    if (!bills.length) throw new Error("This homeowner has no open Monthly Dues balance to receive the Construction Bond credit.");

    const openDues = roundCurrency(bills.reduce((sum, bill) => sum + Number(bill.balance), 0));
    if (amount > openDues) {
      throw new Error("Bond credit cannot exceed the homeowner's current open Monthly Dues balance. Leave any excess in the Construction Bond for later refund or application.");
    }

    let remainingToAllocate = roundCurrency(amount);
    const allocations: Array<{ bill: (typeof bills)[number]; amount: number }> = [];
    for (const bill of bills) {
      if (remainingToAllocate <= 0) break;
      const allocationAmount = roundCurrency(Math.min(remainingToAllocate, Number(bill.balance)));
      if (allocationAmount <= 0) continue;
      allocations.push({ bill, amount: allocationAmount });
      remainingToAllocate = roundCurrency(remainingToAllocate - allocationAmount);
    }
    if (remainingToAllocate !== 0) throw new Error("Construction Bond credit could not be fully allocated to Monthly Dues.");

    const coverage = buildPaymentCoverage(allocations.map((item) => item.bill.billingMonth));
    const receiptNumber = await allocateReceiptNumber(tx, actor.tenantId, applicationDate, "BC");
    const paymentBatchId = bondDuesCreditBatchId(collection.id, randomUUID());
    const payment = await tx.payment.create({
      data: {
        tenantId: actor.tenantId,
        billId: null,
        homeownerId: collection.homeownerId,
        amount,
        paymentDate: applicationDate,
        method: PaymentMethod.OTHER,
        referenceNumber: authorizationReference?.trim() || null,
        paymentBatchId,
        idempotencyKey,
        ...coverage,
        remarks: ["Non-cash Construction Bond credit applied to Monthly Dues.", `Source bond receipt: ${collection.receiptNumber || "N/A"}.`, remarks?.trim()].filter(Boolean).join(" "),
        receiptNumber,
        processedById: actor.id,
      },
    });

    await tx.paymentAllocation.createMany({
      data: allocations.map((item) => ({
        tenantId: actor.tenantId,
        paymentId: payment.id,
        billId: item.bill.id,
        amount: item.amount,
        coverageYear: item.bill.coverageYear,
        coverageMonth: item.bill.coverageMonth,
        coverageLabel: monthLabel(item.bill.billingMonth),
      })),
    });

    const recalculatedBills = [];
    for (const item of allocations) {
      recalculatedBills.push({
        billId: item.bill.id,
        allocatedAmount: item.amount,
        ...(await recalculateBillFromActivePayments(tx, item.bill)),
      });
    }

    await tx.collection.update({ where: { id: collection.id }, data: { refundable: true } });
    const totalApplied = roundCurrency(previouslyApplied + amount);
    const remainingBond = roundCurrency(availableBond - amount);
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorId: actor.id,
        module: "COLLECTIONS",
        action: "APPLY_CONSTRUCTION_BOND_TO_MONTHLY_DUES",
        entityType: "Payment",
        entityId: payment.id,
        metadata: {
          nonCash: true,
          collectionId: collection.id,
          collectionReceiptNumber: collection.receiptNumber,
          bondAmount: Number(collection.amount),
          previousRefunded: Number(collection.amountRefunded),
          amountForfeited: Number(collection.amountForfeited),
          previouslyAppliedToDues: previouslyApplied,
          amountApplied: amount,
          totalAppliedToDues: totalApplied,
          remainingBond,
          homeownerId: collection.homeownerId,
          paymentId: payment.id,
          receiptNumber,
          authorizationReference: authorizationReference?.trim() || null,
          allocations: allocations.map((item) => ({ billId: item.bill.id, amount: item.amount, coverage: monthLabel(item.bill.billingMonth) })),
          processedBy: actor,
          recalculatedBills,
        },
      },
    });

    return { paymentId: payment.id, receiptNumber, amount, appliedAmount: amount, remainingBond, reused: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
