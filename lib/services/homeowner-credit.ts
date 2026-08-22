import { Prisma, RecurringChargeType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recalculateBillFromActivePayments } from "@/lib/services/payment-ledger";
import { monthLabel } from "@/lib/utils";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function applyHomeownerAdvanceCreditToOpenBills({ tenantId, homeownerIds }: { tenantId: string; homeownerIds?: string[] }) {
  const bills = await prisma.bill.findMany({
    where: {
      tenantId,
      archivedAt: null,
      recurringChargeType: RecurringChargeType.MONTHLY_DUES,
      balance: { gt: 0 },
      ...(homeownerIds?.length ? { homeownerId: { in: homeownerIds } } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      homeownerId: true,
      totalAmount: true,
      balance: true,
      dueDate: true,
      billingMonth: true,
      coverageYear: true,
      coverageMonth: true,
    },
    orderBy: [{ homeownerId: "asc" }, { billingMonth: "asc" }, { dueDate: "asc" }],
  });

  let appliedAmount = 0;
  let billsUpdated = 0;
  for (const bill of bills) {
    const result = await prisma.$transaction(
      (tx) => applyHomeownerAdvanceCreditToBill(tx as unknown as Prisma.TransactionClient, bill),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result.appliedAmount > 0) {
      appliedAmount = roundMoney(appliedAmount + result.appliedAmount);
      billsUpdated += 1;
    }
  }
  return { appliedAmount, billsUpdated };
}

export async function applyHomeownerAdvanceCreditToBill(
  tx: Prisma.TransactionClient,
  bill: {
    id: string;
    tenantId: string;
    homeownerId: string;
    totalAmount: Prisma.Decimal;
    balance: Prisma.Decimal;
    dueDate: Date;
    billingMonth: Date;
    coverageYear: number;
    coverageMonth: number;
  },
) {
  let remainingBillBalance = roundMoney(Number(bill.balance));
  if (remainingBillBalance <= 0) return { appliedAmount: 0, allocations: [] as Array<{ paymentId: string; amount: number }> };

  const payments = await tx.payment.findMany({
    where: {
      tenantId: bill.tenantId,
      homeownerId: bill.homeownerId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      amount: true,
      paymentDate: true,
      createdAt: true,
      billId: true,
      allocations: { select: { billId: true, amount: true } },
    },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
  });

  const applied: Array<{ paymentId: string; amount: number }> = [];
  for (const payment of payments) {
    if (remainingBillBalance <= 0) break;
    const alreadyAllocated = roundMoney(payment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0));
    const legacyApplied = payment.allocations.length === 0 && payment.billId ? roundMoney(Number(payment.amount)) : 0;
    const available = roundMoney(Math.max(0, Number(payment.amount) - alreadyAllocated - legacyApplied));
    if (available <= 0) continue;

    const amount = roundMoney(Math.min(available, remainingBillBalance));
    const existing = payment.allocations.find((allocation) => allocation.billId === bill.id);
    await tx.paymentAllocation.upsert({
      where: { paymentId_billId: { paymentId: payment.id, billId: bill.id } },
      create: {
        tenantId: bill.tenantId,
        paymentId: payment.id,
        billId: bill.id,
        amount,
        coverageYear: bill.coverageYear,
        coverageMonth: bill.coverageMonth,
        coverageLabel: monthLabel(bill.billingMonth),
      },
      update: {
        amount: roundMoney(Number(existing?.amount ?? 0) + amount),
        coverageYear: bill.coverageYear,
        coverageMonth: bill.coverageMonth,
        coverageLabel: monthLabel(bill.billingMonth),
      },
    });
    applied.push({ paymentId: payment.id, amount });
    remainingBillBalance = roundMoney(remainingBillBalance - amount);
  }

  if (!applied.length) return { appliedAmount: 0, allocations: applied };

  const recalculated = await recalculateBillFromActivePayments(tx, bill);
  const appliedAmount = roundMoney(applied.reduce((sum, item) => sum + item.amount, 0));
  await tx.auditLog.create({
    data: {
      tenantId: bill.tenantId,
      module: "PAYMENTS",
      action: "AUTO_APPLY_HOMEOWNER_CREDIT",
      entityType: "Bill",
      entityId: bill.id,
      metadata: {
        homeownerId: bill.homeownerId,
        billingMonth: bill.billingMonth.toISOString(),
        appliedAmount,
        allocations: applied,
        recalculated,
        timestamp: new Date().toISOString(),
      },
    },
  });
  return { appliedAmount, allocations: applied, recalculated };
}
