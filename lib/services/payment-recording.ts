import { randomUUID } from "node:crypto";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { buildPaymentCoveragePeriod, paymentCoverageLabel, type PaymentCoveragePeriod } from "@/lib/payment-coverage";
import { normalizePaymentReference } from "@/lib/payment-methods";
import { recalculateBillFromActivePayments } from "@/lib/services/payment-ledger";
import { allocateReceiptNumber } from "@/lib/services/receipt";

type RecordMonthlyDuesInput = {
  actor: { id: string; tenantId: string; name: string; email: string };
  billIds: string[];
  amount: number;
  paymentDate: Date;
  method: PaymentMethod;
  referenceNumber?: string | null;
  remarks?: string | null;
} & PaymentCoveragePeriod;

export async function recordMonthlyDuesPayment(tx: Prisma.TransactionClient, input: RecordMonthlyDuesInput) {
  const billIds = [...new Set(input.billIds.filter(Boolean))];
  if (!billIds.length) throw new Error("Select at least one open billing item.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Payment amount must be greater than zero.");
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

  const coverage = buildPaymentCoveragePeriod(input);
  const coverageLabel = paymentCoverageLabel(coverage);
  const paymentBatchId = randomUUID();
  let remainingAmount = roundMoney(input.amount);
  let receiptIndex = 0;
  const paymentIds: string[] = [];

  for (const [index, bill] of bills.entries()) {
    if (remainingAmount <= 0) break;
    const amount = roundMoney(index === bills.length - 1 ? remainingAmount : Math.min(remainingAmount, Number(bill.balance)));
    if (amount <= 0) continue;
    receiptIndex += 1;
    const receiptNumber = await allocateReceiptNumber(tx, input.actor.tenantId, input.paymentDate, "MD");
    const payment = await tx.payment.create({
      data: {
        tenantId: input.actor.tenantId,
        billId: bill.id,
        homeownerId: bill.homeownerId,
        amount,
        paymentDate: input.paymentDate,
        method: input.method,
        referenceNumber,
        paymentBatchId,
        ...coverage,
        remarks: [
          input.remarks,
          bills.length > 1 ? `Payment allocation ${receiptIndex} of ${bills.length}.` : null,
          index === bills.length - 1 && amount > Number(bill.balance) ? `Includes ${formatPeso(amount - Number(bill.balance))} overpayment.` : null,
        ].filter(Boolean).join(" ") || null,
        receiptNumber,
        processedById: input.actor.id,
      },
    });
    paymentIds.push(payment.id);
    await tx.auditLog.create({
      data: {
        tenantId: input.actor.tenantId,
        actorId: input.actor.id,
        module: "RECEIPTS",
        action: "GENERATE_MD_RECEIPT",
        entityType: "Payment",
        entityId: payment.id,
        metadata: {
          receiptNumber,
          amount,
          homeownerId: bill.homeownerId,
          paymentBatchId,
          coverageStart: coverage.coverageStart,
          coverageEnd: coverage.coverageEnd,
          coverageMonths: coverage.coverageMonths,
          paymentType: "MONTHLY_DUES",
          paymentCoverageDisplay: coverage.paymentCoverageDisplay,
          coverageFrom: { month: coverage.coverageFromMonth, year: coverage.coverageFromYear },
          coverageTo: { month: coverage.coverageToMonth, year: coverage.coverageToYear },
          homeowner: { id: bill.homeownerId, name: bill.homeowner.user.name },
          adminUser: input.actor,
          timestamp: new Date().toISOString(),
        },
      },
    });
    remainingAmount = roundMoney(remainingAmount - amount);
    await recalculateBillFromActivePayments(tx, bill);
  }

  if (remainingAmount > 0) throw new Error("The payment amount could not be fully allocated to the selected billings.");
  return {
    recipientId: bills[0].homeowner.userId,
    email: bills[0].homeowner.user.email,
    name: bills[0].homeowner.user.name,
    amount: input.amount,
    referenceNumber,
    paymentBatchId,
    paymentIds,
    coverageLabel,
    coverageDisplay: coverage.paymentCoverageDisplay,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}
