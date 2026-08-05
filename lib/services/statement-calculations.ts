import { paymentAllocationCoverageDisplay } from "@/lib/payment-coverage";
import { totalUnappliedCredit } from "@/lib/payment-credit";
import { receivablesAgingBucket } from "@/lib/services/receivables-aging";
import { collectionLabel, monthLabel } from "@/lib/utils";

export type StatementLedgerEntry = {
  date: Date;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  runningBalance: number;
  transactionType: string;
  sortOrder: number;
};

type StatementBill = {
  id: string;
  billingMonth: Date;
  coverageYear: number;
  coverageMonth: number;
  resolutionReference: string | null;
  totalAmount: unknown;
  penalty: unknown;
  balance: unknown;
  dueDate: Date;
  createdAt: Date;
};

type StatementPayment = {
  id: string;
  paymentDate: Date;
  amount: unknown;
  status: string;
  voidedAt?: Date | null;
  voidReason?: string | null;
  receiptNumber: string | null;
  referenceNumber: string | null;
  paymentCoverageDisplay: string | null;
  bill?: { billingMonth: Date } | null;
  allocations?: Array<{ amount: unknown; coverageLabel: string | null; bill: { billingMonth: Date } }>;
  coverageStart?: Date | null;
  coverageEnd?: Date | null;
  coverageMonths?: unknown;
  coverageFromMonth?: number | null;
  coverageFromYear?: number | null;
  coverageToMonth?: number | null;
  coverageToYear?: number | null;
};

type StatementCollection = {
  id: string;
  type: string;
  description: string | null;
  amount: unknown;
  amountForfeited: unknown;
  collectionDate: Date;
  receiptNumber: string | null;
  referenceNumber: string | null;
  refunds: Array<{
    id: string;
    amount: unknown;
    refundDate: Date;
    referenceNumber: string | null;
  }>;
};

export function buildStatementLedger(input: {
  bills: StatementBill[];
  payments: StatementPayment[];
  collections: StatementCollection[];
}) {
  const entries: Omit<StatementLedgerEntry, "runningBalance">[] = [];

  for (const bill of input.bills) {
    entries.push({
      date: bill.billingMonth,
      description: `Monthly dues - ${monthLabel(bill.billingMonth)}`,
      reference: billPublicReference(bill),
      debit: Number(bill.totalAmount),
      credit: 0,
      transactionType: Number(bill.penalty) > 0 ? "Monthly Dues / Penalty" : "Monthly Dues",
      sortOrder: 10,
    });
  }

  for (const collection of input.collections) {
    const label = collectionLabel(collection.type, collection.description);
    entries.push({
      date: collection.collectionDate,
      description: label,
      reference: collection.receiptNumber || collection.referenceNumber || datedPublicReference("Collection", collection.collectionDate),
      debit: Number(collection.amount),
      credit: 0,
      transactionType: label,
      sortOrder: 20,
    });
    const forfeited = Number(collection.amountForfeited);
    if (forfeited > 0) {
      entries.push({
        date: collection.collectionDate,
        description: `${label} forfeiture adjustment`,
        reference: collection.referenceNumber || datedPublicReference("Adjustment", collection.collectionDate),
        debit: 0,
        credit: forfeited,
        transactionType: "Adjustment",
        sortOrder: 30,
      });
    }
    for (const refund of collection.refunds) {
      entries.push({
        date: refund.refundDate,
        description: `${label} refund`,
        reference: refund.referenceNumber || datedPublicReference("Refund", refund.refundDate),
        debit: 0,
        credit: Number(refund.amount),
        transactionType: "Adjustment",
        sortOrder: 40,
      });
    }
  }

  for (const payment of input.payments) {
    entries.push({
      date: payment.paymentDate,
      description: paymentAllocationCoverageDisplay(payment),
      reference: payment.receiptNumber || payment.referenceNumber || paymentPublicReference(payment.paymentDate),
      debit: 0,
      credit: Number(payment.amount),
      transactionType: "Payment",
      sortOrder: 50,
    });
    if (payment.status === "VOIDED" && payment.voidedAt) {
      entries.push({
        date: payment.voidedAt,
        description: `Void receipt ${payment.receiptNumber || paymentPublicReference(payment.paymentDate)}${payment.voidReason ? ` - ${payment.voidReason}` : ""}`,
        reference: payment.receiptNumber || payment.referenceNumber || datedPublicReference("Void", payment.voidedAt),
        debit: Number(payment.amount),
        credit: 0,
        transactionType: "Payment Void",
        sortOrder: 60,
      });
    }
  }

  let runningBalance = 0;
  return entries
    .sort((left, right) => left.date.valueOf() - right.date.valueOf() || left.sortOrder - right.sortOrder || left.reference.localeCompare(right.reference))
    .map((entry) => {
      runningBalance += entry.debit - entry.credit;
      return { ...entry, runningBalance };
    });
}

export function summarizeStatementAccount(input: {
  bills: StatementBill[];
  payments: StatementPayment[];
  ledger: StatementLedgerEntry[];
  asOf: Date;
}) {
  const activePayments = input.payments.filter((payment) => payment.status === "ACTIVE");
  const totalAmountBilled = input.bills.reduce((total, bill) => total + Number(bill.totalAmount), 0);
  const currentOutstandingBalance = input.bills.reduce((total, bill) => total + Number(bill.balance), 0);
  const totalPayments = activePayments.reduce((total, payment) => total + Number(payment.amount), 0);
  const availableCredit = totalUnappliedCredit(activePayments);
  const totalPenalties = input.bills.reduce((total, bill) => total + Number(bill.penalty), 0);
  const totalCredits = input.ledger.reduce((total, entry) => total + entry.credit - (entry.transactionType === "Payment Void" ? entry.debit : 0), 0);
  const lastPayment = activePayments.at(-1);
  const overdueBills = input.bills.filter((bill) => Number(bill.balance) > 0 && bill.dueDate < input.asOf);
  const collectionStatus = currentOutstandingBalance <= 0 ? "Current" : overdueBills.length ? "Overdue" : "Open Balance";

  return {
    lastPayment,
    summary: {
      currentOutstandingBalance,
      availableCredit,
      netAccountBalance: currentOutstandingBalance - availableCredit,
      totalAmountBilled,
      totalPayments,
      totalCredits,
      totalPenalties,
      lastPaymentDate: lastPayment?.paymentDate ?? null,
      collectionStatus,
    },
  };
}

export function buildStatementAging(bills: Array<{ dueDate: Date; balance: unknown }>, today: Date) {
  const aging = { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyDays: 0, overOneHundredTwenty: 0 };
  for (const bill of bills) {
    const balance = Number(bill.balance);
    if (balance <= 0) continue;
    aging[receivablesAgingBucket(bill.dueDate, today)] += balance;
  }
  return aging;
}

function billPublicReference(bill: { coverageYear: number; coverageMonth: number; resolutionReference: string | null }) {
  return bill.resolutionReference || `Billing ${bill.coverageYear}-${String(bill.coverageMonth).padStart(2, "0")}`;
}

function paymentPublicReference(paymentDate: Date) {
  return datedPublicReference("Payment", paymentDate);
}

function datedPublicReference(label: string, date: Date) {
  return `${label} ${date.toISOString().slice(0, 10)}`;
}
