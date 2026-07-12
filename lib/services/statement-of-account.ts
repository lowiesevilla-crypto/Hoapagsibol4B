import "server-only";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { paymentAllocationCoverageDisplay } from "@/lib/payment-coverage";
import { getAssociationSettings } from "@/lib/system-settings";
import { collectionLabel, monthLabel } from "@/lib/utils";

const dayMs = 24 * 60 * 60 * 1000;

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

export async function getStatementOfAccount(homeownerId: string, tenantId: string, baseUrl: string) {
  const [homeowner, bills, payments, collections, association] = await Promise.all([
    prisma.homeownerProfile.findFirst({ where: { id: homeownerId, tenantId }, include: { user: true } }),
    prisma.bill.findMany({
      where: { homeownerId, tenantId, archivedAt: null },
      orderBy: [{ billingMonth: "asc" }, { createdAt: "asc" }],
    }),
    prisma.payment.findMany({
      where: { homeownerId, tenantId, status: "ACTIVE" },
      include: { bill: true, allocations: { include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } }, processedBy: true },
      orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.collection.findMany({
      where: { homeownerId, tenantId },
      include: { createdBy: true, refunds: { include: { processedBy: true }, orderBy: { refundDate: "asc" } } },
      orderBy: [{ collectionDate: "asc" }, { createdAt: "asc" }],
    }),
    getAssociationSettings(tenantId),
  ]);

  if (!homeowner) notFound();

  const ledger = buildLedger({ bills, payments, collections });
  const totalAmountBilled = bills.reduce((total, bill) => total + Number(bill.totalAmount), 0);
  const currentOutstandingBalance = bills.reduce((total, bill) => total + Number(bill.balance), 0);
  const totalPayments = payments.reduce((total, payment) => total + Number(payment.amount), 0);
  const totalPenalties = bills.reduce((total, bill) => total + Number(bill.penalty), 0);
  const totalCredits = ledger.reduce((total, entry) => total + entry.credit, 0);
  const lastPayment = payments.at(-1);
  const today = new Date();
  const overdueBills = bills.filter((bill) => Number(bill.balance) > 0 && bill.dueDate < today);
  const collectionStatus = currentOutstandingBalance <= 0 ? "Current" : overdueBills.length ? "Overdue" : "Open Balance";
  const statementDate = new Date();
  const statementCode = `SOA-${homeowner.id.slice(-8).toUpperCase()}-${statementDate.toISOString().slice(0, 10).replaceAll("-", "")}`;
  const verifyUrl = `${baseUrl.replace(/\/$/, "")}/admin/homeowners/${homeowner.id}/soa`;

  return {
    association,
    homeowner,
    accountNumber: `HOA-${homeowner.block}-${homeowner.lot}-${homeowner.id.slice(-5).toUpperCase()}`,
    statementDate,
    statementCode,
    verifyUrl,
    summary: {
      currentOutstandingBalance,
      totalAmountBilled,
      totalPayments,
      totalCredits,
      totalPenalties,
      lastPaymentDate: lastPayment?.paymentDate ?? null,
      collectionStatus,
    },
    ledger,
    paymentHistory: [...payments].reverse().map((payment) => ({
      id: payment.id,
      paymentDate: payment.paymentDate,
      officialReceiptNo: payment.receiptNumber || fallbackReference("OR", payment.id),
      paymentMethod: payment.method.replaceAll("_", " "),
      referenceNumber: payment.referenceNumber || "-",
      coverage: paymentAllocationCoverageDisplay(payment),
      amount: Number(payment.amount),
      collector: payment.processedBy?.name ?? "Authorized HOA Collector",
    })),
    billingHistory: [...bills].reverse().map((bill) => ({
      id: bill.id,
      billingDate: bill.createdAt,
      billingType: "Monthly Dues",
      coverage: monthLabel(bill.billingMonth),
      amount: Number(bill.totalAmount),
      status: bill.status,
    })),
    aging: buildAging(bills, today),
  };
}

function buildLedger(input: {
  bills: Array<{
    id: string;
    billingMonth: Date;
    totalAmount: unknown;
    penalty: unknown;
    createdAt: Date;
  }>;
  payments: Array<{
    id: string;
    paymentDate: Date;
    amount: unknown;
    receiptNumber: string | null;
    referenceNumber: string | null;
    paymentCoverageDisplay: string | null;
    bill?: { billingMonth: Date } | null;
    allocations?: Array<{ coverageLabel: string | null; bill: { billingMonth: Date } }>;
    coverageStart?: Date | null;
    coverageEnd?: Date | null;
    coverageMonths?: unknown;
    coverageFromMonth?: number | null;
    coverageFromYear?: number | null;
    coverageToMonth?: number | null;
    coverageToYear?: number | null;
  }>;
  collections: Array<{
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
  }>;
}) {
  const entries: Omit<StatementLedgerEntry, "runningBalance">[] = [];

  for (const bill of input.bills) {
    entries.push({
      date: bill.billingMonth,
      description: `Monthly dues - ${monthLabel(bill.billingMonth)}`,
      reference: fallbackReference("BILL", bill.id),
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
      reference: collection.receiptNumber || collection.referenceNumber || fallbackReference("COL", collection.id),
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
        reference: collection.referenceNumber || fallbackReference("ADJ", collection.id),
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
        reference: refund.referenceNumber || fallbackReference("REF", refund.id),
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
      reference: payment.receiptNumber || payment.referenceNumber || fallbackReference("PAY", payment.id),
      debit: 0,
      credit: Number(payment.amount),
      transactionType: "Payment",
      sortOrder: 50,
    });
  }

  let runningBalance = 0;
  return entries
    .sort((left, right) => left.date.valueOf() - right.date.valueOf() || left.sortOrder - right.sortOrder || left.reference.localeCompare(right.reference))
    .map((entry) => {
      runningBalance += entry.debit - entry.credit;
      return { ...entry, runningBalance };
    });
}

function buildAging(
  bills: Array<{ dueDate: Date; balance: unknown }>,
  today: Date,
) {
  const aging = { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyDays: 0, overOneHundredTwenty: 0 };
  for (const bill of bills) {
    const balance = Number(bill.balance);
    if (balance <= 0) continue;
    const daysPastDue = Math.floor((startOfDay(today).valueOf() - startOfDay(bill.dueDate).valueOf()) / dayMs);
    if (daysPastDue <= 0) aging.current += balance;
    else if (daysPastDue <= 30) aging.thirtyDays += balance;
    else if (daysPastDue <= 60) aging.sixtyDays += balance;
    else if (daysPastDue <= 90) aging.ninetyDays += balance;
    else aging.overOneHundredTwenty += balance;
  }
  return aging;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function fallbackReference(prefix: string, id: string) {
  return `${prefix}-${id.slice(-8).toUpperCase()}`;
}
