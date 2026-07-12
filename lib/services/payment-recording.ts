import { randomUUID } from "node:crypto";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { buildPaymentCoveragePeriod, paymentCoverageLabel, type PaymentCoveragePeriod } from "@/lib/payment-coverage";
import { normalizePaymentReference } from "@/lib/payment-methods";
import { recalculateBillFromActivePayments } from "@/lib/services/payment-ledger";
import { allocateReceiptNumber } from "@/lib/services/receipt";
import { monthLabel } from "@/lib/utils";

type RecordMonthlyDuesInput = {
  actor: { id: string; tenantId: string; name: string; email: string };
  billIds: string[];
  amount: number;
  paymentDate: Date;
  method: PaymentMethod;
  idempotencyKey: string;
  referenceNumber?: string | null;
  remarks?: string | null;
} & PaymentCoveragePeriod;

export async function recordMonthlyDuesPayment(tx: Prisma.TransactionClient, input: RecordMonthlyDuesInput) {
  const billIds = [...new Set(input.billIds.filter(Boolean))];
  if (!billIds.length) throw new Error("Select at least one open billing item.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Payment amount must be greater than zero.");
  if (!input.idempotencyKey || input.idempotencyKey.length > 100) throw new Error("Payment submission token is invalid. Refresh the form and try again.");

  const existing = await tx.payment.findFirst({
    where: { tenantId: input.actor.tenantId, idempotencyKey: input.idempotencyKey },
    include: { homeowner: { include: { user: true } } },
  });
  if (existing) return buildPaymentConfirmation(existing, true);

  const referenceNumber = normalizePaymentReference(input.method, input.referenceNumber);
  if (referenceNumber) {
    const duplicatePayment = await tx.payment.findFirst({ where: { tenantId: input.actor.tenantId, referenceNumber } });
    if (duplicatePayment) throw new Error("This payment reference number has already been recorded.");
    const duplicateRequest = await tx.paymentRequest.findFirst({ where: { tenantId: input.actor.tenantId, referenceNumber, status: { not: "REJECTED" } } });
    if (duplicateRequest) throw new Error("This reference number is already attached to a QR/GCash payment request.");
  }

  const bills = await tx.bill.findMany({
    where: { tenantId: input.actor.tenantId, id: { in: billIds }, balance: { gt: 0 }, archivedAt: null },
    include: { homeowner: { include: { user: true } } },
    orderBy: [{ billingMonth: "asc" }, { dueDate: "asc" }],
  });
  if (bills.length !== billIds.length) throw new Error("One or more selected billings are no longer open.");
  if (new Set(bills.map((bill) => bill.homeownerId)).size !== 1) throw new Error("Record payments for one homeowner at a time.");
  if (bills.some((bill) => bill.tenantId !== input.actor.tenantId || bill.homeowner.tenantId !== input.actor.tenantId)) {
    throw new Error("One or more selected billings do not belong to the authenticated tenant.");
  }

  const selectedBalance = roundMoney(bills.reduce((sum, bill) => sum + Number(bill.balance), 0));
  if (roundMoney(input.amount) > selectedBalance) throw new Error("Payment amount cannot exceed the selected outstanding balances.");

  const coverage = buildPaymentCoveragePeriod(input);
  const allocations = buildAllocations(bills, input.amount);
  const allocatedTotal = roundMoney(allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  if (allocatedTotal !== roundMoney(input.amount)) throw new Error("The payment amount could not be fully allocated to the selected billings.");

  const receiptNumber = await allocateReceiptNumber(tx, input.actor.tenantId, input.paymentDate, "MD");
  const paymentBatchId = randomUUID();
  const payment = await tx.payment.create({
    data: {
      tenantId: input.actor.tenantId,
      billId: null,
      homeownerId: bills[0].homeownerId,
      amount: allocatedTotal,
      paymentDate: input.paymentDate,
      method: input.method,
      referenceNumber,
      paymentBatchId,
      idempotencyKey: input.idempotencyKey,
      ...coverage,
      remarks: input.remarks || null,
      receiptNumber,
      processedById: input.actor.id,
    },
  });

  await tx.paymentAllocation.createMany({
    data: allocations.map((allocation) => ({
      tenantId: input.actor.tenantId,
      paymentId: payment.id,
      billId: allocation.bill.id,
      amount: allocation.amount,
      coverageYear: allocation.bill.coverageYear,
      coverageMonth: allocation.bill.coverageMonth,
      coverageLabel: monthLabel(allocation.bill.billingMonth),
    })),
  });

  const recalculatedBills = [];
  for (const allocation of allocations) {
    recalculatedBills.push({
      billId: allocation.bill.id,
      allocatedAmount: allocation.amount,
      ...(await recalculateBillFromActivePayments(tx, allocation.bill)),
    });
  }

  await tx.auditLog.create({
    data: {
      tenantId: input.actor.tenantId,
      actorId: input.actor.id,
      module: "PAYMENTS",
      action: "RECORD_PAYMENT_TRANSACTION",
      entityType: "Payment",
      entityId: payment.id,
      metadata: {
        receiptNumber,
        totalAmount: allocatedTotal,
        homeownerId: bills[0].homeownerId,
        paymentBatchId,
        idempotencyKey: input.idempotencyKey,
        selectedBillIds: billIds,
        allocations: allocations.map((allocation) => ({ billId: allocation.bill.id, amount: allocation.amount, coverage: monthLabel(allocation.bill.billingMonth) })),
        method: input.method,
        referenceNumber,
        coverageStart: coverage.coverageStart,
        coverageEnd: coverage.coverageEnd,
        paymentCoverageDisplay: coverage.paymentCoverageDisplay,
        homeowner: { id: bills[0].homeownerId, name: bills[0].homeowner.user.name },
        adminUser: input.actor,
        recalculatedBills,
        timestamp: new Date().toISOString(),
      },
    },
  });

  return buildPaymentConfirmation({ ...payment, homeowner: bills[0].homeowner }, false);
}

function buildAllocations<T extends { balance: Prisma.Decimal }>(bills: T[], amount: number) {
  let remaining = roundMoney(amount);
  const allocations: Array<{ bill: T; amount: number }> = [];
  for (const bill of bills) {
    if (remaining <= 0) break;
    const allocatedAmount = roundMoney(Math.min(remaining, Number(bill.balance)));
    if (allocatedAmount <= 0) continue;
    allocations.push({ bill, amount: allocatedAmount });
    remaining = roundMoney(remaining - allocatedAmount);
  }
  if (remaining > 0) throw new Error("Payment amount cannot exceed the selected outstanding balances.");
  return allocations;
}

export function buildPaymentConfirmation(payment: {
  id: string;
  amount: Prisma.Decimal;
  referenceNumber: string | null;
  paymentBatchId: string | null;
  paymentCoverageDisplay: string | null;
  coverageFromMonth: number | null;
  coverageFromYear: number | null;
  coverageToMonth: number | null;
  coverageToYear: number | null;
  homeowner: { userId: string; user: { email: string; name: string } };
}, reused: boolean) {
  return {
    recipientId: payment.homeowner.userId,
    email: payment.homeowner.user.email,
    name: payment.homeowner.user.name,
    amount: Number(payment.amount),
    referenceNumber: payment.referenceNumber,
    paymentBatchId: payment.paymentBatchId,
    paymentId: payment.id,
    paymentIds: [payment.id],
    coverageLabel: paymentCoverageLabel(payment),
    coverageDisplay: payment.paymentCoverageDisplay || `Monthly Dues - ${paymentCoverageLabel(payment)}`,
    reused,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
