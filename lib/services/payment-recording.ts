import { randomUUID } from "node:crypto";
import { HomeownerStatus, Prisma, RecurringChargeType, type PaymentMethod } from "@prisma/client";
import { buildPaymentCoveragePeriod, paymentCoverageLabel, type PaymentCoveragePeriod } from "@/lib/payment-coverage";
import { normalizePaymentReference } from "@/lib/payment-methods";
import { paymentAppliedAmount, paymentUnappliedCredit } from "@/lib/payment-credit";
import { recalculateBillFromActivePayments } from "@/lib/services/payment-ledger";
import { allocateReceiptNumber } from "@/lib/services/receipt";
import { monthLabel } from "@/lib/utils";

type RecordMonthlyDuesInput = {
  actor: { id: string; tenantId: string; name: string; email: string };
  homeownerId: string;
  billIds: string[];
  amount: number;
  paymentDate: Date;
  method: PaymentMethod;
  idempotencyKey: string;
  referenceNumber?: string | null;
  remarks?: string | null;
} & PaymentCoveragePeriod;

export async function recordMonthlyDuesPayment(tx: Prisma.TransactionClient, input: RecordMonthlyDuesInput) {
  const requestedBillIds = [...new Set(input.billIds.filter(Boolean))];
  if (!input.homeownerId) throw new Error("Select a homeowner.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Payment amount must be greater than zero.");
  if (!input.idempotencyKey || input.idempotencyKey.length > 100) throw new Error("Payment submission token is invalid. Refresh the form and try again.");

  const existing = await tx.payment.findFirst({
    where: { tenantId: input.actor.tenantId, idempotencyKey: input.idempotencyKey },
    include: { homeowner: { include: { user: true } }, allocations: true },
  });
  if (existing) return buildPaymentConfirmation(existing, true);

  const homeowner = await tx.homeownerProfile.findFirst({
    where: { id: input.homeownerId, tenantId: input.actor.tenantId, status: HomeownerStatus.ACTIVE },
    include: { user: true },
  });
  if (!homeowner) throw new Error("Homeowner not found or is not active in this tenant.");

  const referenceNumber = normalizePaymentReference(input.method, input.referenceNumber);
  if (referenceNumber) {
    const duplicatePayment = await tx.payment.findFirst({ where: { tenantId: input.actor.tenantId, referenceNumber, status: "ACTIVE" } });
    if (duplicatePayment) throw new Error("This payment reference number has already been recorded.");
    const duplicateRequest = await tx.paymentRequest.findFirst({ where: { tenantId: input.actor.tenantId, referenceNumber, status: { not: "REJECTED" } } });
    if (duplicateRequest) throw new Error("This reference number is already attached to a QR/GCash payment request.");
  }

  const bills = requestedBillIds.length
    ? await tx.bill.findMany({
        where: { tenantId: input.actor.tenantId, homeownerId: homeowner.id, id: { in: requestedBillIds }, balance: { gt: 0 }, archivedAt: null, recurringChargeType: RecurringChargeType.MONTHLY_DUES },
        include: { homeowner: { include: { user: true } } },
        orderBy: [{ billingMonth: "asc" }, { dueDate: "asc" }],
      })
    : await tx.bill.findMany({
        where: { tenantId: input.actor.tenantId, homeownerId: homeowner.id, balance: { gt: 0 }, archivedAt: null, recurringChargeType: RecurringChargeType.MONTHLY_DUES },
        include: { homeowner: { include: { user: true } } },
        orderBy: [{ billingMonth: "asc" }, { dueDate: "asc" }],
      });

  if (requestedBillIds.length && bills.length !== requestedBillIds.length) throw new Error("One or more selected billings are no longer open.");
  if (bills.some((bill) => bill.homeownerId !== homeowner.id || bill.tenantId !== input.actor.tenantId)) {
    throw new Error("One or more selected billings do not belong to the selected homeowner and tenant.");
  }

  const coverage = buildPaymentCoveragePeriod(input);
  const replacedVoidedPayments = referenceNumber
    ? await tx.payment.findMany({ where: { tenantId: input.actor.tenantId, referenceNumber, status: "VOIDED" }, select: { id: true, receiptNumber: true } })
    : [];
  const allocations = buildAllocations(bills, input.amount);
  const allocatedTotal = roundMoney(allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  const paymentTotal = roundMoney(input.amount);
  if (allocatedTotal > paymentTotal) throw new Error("Allocated amount cannot exceed the total payment received.");
  const unappliedCredit = roundMoney(paymentTotal - allocatedTotal);

  const receiptNumber = await allocateReceiptNumber(tx, input.actor.tenantId, input.paymentDate, "MD");
  const paymentBatchId = randomUUID();
  const payment = await tx.payment.create({
    data: {
      tenantId: input.actor.tenantId,
      billId: null,
      homeownerId: homeowner.id,
      amount: paymentTotal,
      paymentDate: input.paymentDate,
      method: input.method,
      referenceNumber,
      paymentBatchId,
      idempotencyKey: input.idempotencyKey,
      ...coverage,
      remarks: input.remarks || (allocations.length ? null : "Advance Monthly Dues Credit"),
      receiptNumber,
      processedById: input.actor.id,
    },
  });

  if (allocations.length) {
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
  }

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
      action: allocations.length ? "RECORD_PAYMENT_TRANSACTION" : "RECORD_ADVANCE_MONTHLY_DUES_PAYMENT",
      entityType: "Payment",
      entityId: payment.id,
      metadata: {
        receiptNumber,
        totalAmount: paymentTotal,
        appliedAmount: allocatedTotal,
        unappliedCredit,
        advanceOnly: allocations.length === 0,
        homeownerId: homeowner.id,
        paymentBatchId,
        idempotencyKey: input.idempotencyKey,
        selectedBillIds: bills.map((bill) => bill.id),
        allocations: allocations.map((allocation) => ({ billId: allocation.bill.id, amount: allocation.amount, coverage: monthLabel(allocation.bill.billingMonth) })),
        method: input.method,
        referenceNumber,
        replacesVoidedPayments: replacedVoidedPayments,
        coverageStart: coverage.coverageStart,
        coverageEnd: coverage.coverageEnd,
        paymentCoverageDisplay: coverage.paymentCoverageDisplay,
        homeowner: { id: homeowner.id, name: homeowner.user.name },
        adminUser: input.actor,
        recalculatedBills,
        timestamp: new Date().toISOString(),
      },
    },
  });

  return buildPaymentConfirmation({ ...payment, homeowner, allocations: allocations.map((allocation) => ({ amount: allocation.amount })) }, false);
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
  return allocations;
}

export function buildPaymentConfirmation(payment: {
  id: string;
  amount: Prisma.Decimal;
  billId?: string | null;
  referenceNumber: string | null;
  paymentBatchId: string | null;
  paymentCoverageDisplay: string | null;
  coverageFromMonth: number | null;
  coverageFromYear: number | null;
  coverageToMonth: number | null;
  coverageToYear: number | null;
  allocations?: Array<{ amount: unknown }>;
  homeowner: { userId: string; user: { email: string; name: string } };
}, reused: boolean) {
  const coverageSource = {
    paymentCoverageDisplay: payment.paymentCoverageDisplay,
    coverageFromMonth: payment.coverageFromMonth,
    coverageFromYear: payment.coverageFromYear,
    coverageToMonth: payment.coverageToMonth,
    coverageToYear: payment.coverageToYear,
  };
  const coverageLabel = paymentCoverageLabel(coverageSource);
  return {
    recipientId: payment.homeowner.userId,
    email: payment.homeowner.user.email,
    name: payment.homeowner.user.name,
    amount: Number(payment.amount),
    referenceNumber: payment.referenceNumber,
    paymentBatchId: payment.paymentBatchId,
    paymentId: payment.id,
    paymentIds: [payment.id],
    coverageLabel,
    coverageDisplay: payment.paymentCoverageDisplay || `Monthly Dues - ${coverageLabel}`,
    appliedAmount: paymentAppliedAmount(payment),
    unappliedCredit: paymentUnappliedCredit(payment),
    reused,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
