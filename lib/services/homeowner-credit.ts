import { Prisma } from "@prisma/client";
import { recalculateBillFromActivePayments } from "@/lib/services/payment-ledger";
import { monthLabel } from "@/lib/utils";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
