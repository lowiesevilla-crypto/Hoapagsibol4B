import { PaymentMethod, PaymentStatus, Prisma, RecurringChargeType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { paymentAppliedAmount, paymentUnappliedCredit } from "@/lib/payment-credit";
import { receivablesAgingBucket, receivablesAgingBuckets, type ReceivablesAgingBucket } from "@/lib/services/receivables-aging";

const pageSize = 10;
const queryPageSize = 500;
const selectedPaymentSelect = {
  id: true,
  amount: true,
  paymentDate: true,
  method: true,
  referenceNumber: true,
  receiptNumber: true,
  status: true,
  voidedAt: true,
  createdAt: true,
  homeowner: { select: { user: { select: { name: true } } } },
  processedBy: { select: { name: true } },
  voidedBy: { select: { name: true } },
  bill: { select: { recurringChargeType: true } },
  allocations: { select: { amount: true, bill: { select: { recurringChargeType: true } } } },
} satisfies Prisma.PaymentSelect;
const billAsOfSelect = {
  id: true,
  homeownerId: true,
  billingMonth: true,
  dueDate: true,
  totalAmount: true,
  recurringChargeType: true,
  homeowner: { select: { block: true, lot: true, user: { select: { name: true } } } },
  paymentAllocations: { select: { amount: true } },
  payments: { select: { amount: true } },
} satisfies Prisma.BillSelect;

type SelectedPayment = Prisma.PaymentGetPayload<{ select: typeof selectedPaymentSelect }>;
type BillAsOf = Prisma.BillGetPayload<{ select: typeof billAsOfSelect }>;

export class FinanceDashboardInputError extends Error {}

export function parseFinanceDashboardDateRange(fromInput?: string | null, toInput?: string | null, now = new Date()) {
  const defaultFrom = `${now.getUTCFullYear()}-01-01`;
  const defaultTo = now.toISOString().slice(0, 10);
  const fromText = fromInput === undefined || fromInput === null || fromInput === "" ? defaultFrom : validateDateInput(fromInput, "Start date");
  const toText = toInput === undefined || toInput === null || toInput === "" ? defaultTo : validateDateInput(toInput, "End date");
  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  if (from > to) throw new FinanceDashboardInputError("Start date must be on or before end date.");
  return { from, to, fromText, toText };
}

export async function getFinanceDashboard(input: {
  tenantId: string;
  fromInput?: string | null;
  toInput?: string | null;
  delinquentSearch?: string | null;
  delinquentPage?: string | number | null;
}) {
  const range = parseFinanceDashboardDateRange(input.fromInput, input.toInput);
  const tenantId = input.tenantId;
  const selectedCreatedRange = { gte: range.from, lte: range.to };

  const [payments, bills, pendingPaymentRequests, otherCollections, billingRuns, paymentRequests] = await Promise.all([
    loadSelectedPayments(tenantId, range.from, range.to),
    loadBillsAsOf(tenantId, range.to),
    prisma.paymentRequest.count({ where: { tenantId, status: "PENDING_REVIEW", createdAt: selectedCreatedRange } }),
    prisma.collection.aggregate({
      where: { tenantId, refundable: false, collectionDate: { gte: range.from, lte: range.to } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.auditLog.findMany({
      where: { tenantId, module: "BILLING", action: "GENERATE_MONTHLY_DUES", createdAt: selectedCreatedRange },
      select: { createdAt: true, metadata: true, actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.paymentRequest.findMany({
      where: { tenantId, createdAt: selectedCreatedRange },
      select: {
        createdAt: true,
        amount: true,
        status: true,
        referenceNumber: true,
        homeowner: { select: { user: { select: { name: true } } } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const activePayments = payments.filter((payment) => payment.status === PaymentStatus.ACTIVE);
  const voidedPayments = payments.filter((payment) => payment.status === PaymentStatus.VOIDED);
  const periodBills = bills.filter((bill) => bill.billingMonth >= range.from && bill.billingMonth <= range.to);
  const totalBilled = roundMoney(periodBills.reduce((sum, bill) => sum + Number(bill.totalAmount), 0));
  const activeCollections = roundMoney(activePayments.reduce((sum, payment) => sum + Number(payment.amount), 0));
  const voidedCollections = roundMoney(voidedPayments.reduce((sum, payment) => sum + Number(payment.amount), 0));
  const amountAppliedToBills = roundMoney(activePayments.reduce((sum, payment) => sum + paymentAppliedAmount(payment), 0));
  const unappliedCredit = roundMoney(activePayments.reduce((sum, payment) => sum + paymentUnappliedCredit(payment), 0));

  const aging = Object.fromEntries(receivablesAgingBuckets.map((bucket) => [bucket.key, { key: bucket.key, label: bucket.label, amount: 0, billCount: 0 }])) as Record<ReceivablesAgingBucket, AgingRow>;
  const delinquentMap = new Map<string, DelinquentAccumulator>();
  let outstandingReceivables = 0;
  const balanceByBill = new Map<string, number>();

  for (const bill of bills) {
    const allocated = bill.paymentAllocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
    const legacy = bill.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const balance = roundMoney(Math.max(0, Number(bill.totalAmount) - allocated - legacy));
    balanceByBill.set(bill.id, balance);
    if (balance <= 0) continue;
    outstandingReceivables = roundMoney(outstandingReceivables + balance);
    const bucket = receivablesAgingBucket(bill.dueDate, range.to);
    aging[bucket].amount = roundMoney(aging[bucket].amount + balance);
    aging[bucket].billCount += 1;
    const existing = delinquentMap.get(bill.homeownerId);
    if (existing) {
      existing.outstandingBalance = roundMoney(existing.outstandingBalance + balance);
      if (bill.dueDate < existing.oldestUnpaidDate) existing.oldestUnpaidDate = bill.dueDate;
    } else {
      delinquentMap.set(bill.homeownerId, {
        homeownerId: bill.homeownerId,
        homeownerName: bill.homeowner.user.name,
        accountNumber: homeownerAccountNumber(bill.homeowner),
        block: bill.homeowner.block,
        lot: bill.homeowner.lot,
        outstandingBalance: balance,
        oldestUnpaidDate: bill.dueDate,
      });
    }
  }

  const allDelinquent = [...delinquentMap.values()]
    .map((row) => ({ ...row, agingBucket: agingLabel(receivablesAgingBucket(row.oldestUnpaidDate, range.to)) }))
    .sort((left, right) => right.outstandingBalance - left.outstandingBalance || left.homeownerName.localeCompare(right.homeownerName));
  const search = (input.delinquentSearch ?? "").trim();
  const normalizedSearch = search.toLocaleLowerCase("en-PH");
  const filteredDelinquent = normalizedSearch
    ? allDelinquent.filter((row) => [row.homeownerName, row.accountNumber, row.block, row.lot].some((value) => value.toLocaleLowerCase("en-PH").includes(normalizedSearch)))
    : allDelinquent;
  const requestedPage = positiveInteger(input.delinquentPage, 1);
  const pageCount = Math.max(1, Math.ceil(filteredDelinquent.length / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);
  const delinquentRows = filteredDelinquent.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const monthlyTrend = createMonthlyTrend(range.from, range.to);
  const monthMap = new Map(monthlyTrend.map((row) => [row.key, row]));
  const methodMap = new Map<PaymentMethod, { method: PaymentMethod; label: string; transactionCount: number; totalAmount: number }>();
  for (const payment of payments) {
    const trend = monthMap.get(monthKey(payment.paymentDate));
    if (!trend) continue;
    if (payment.status === PaymentStatus.ACTIVE) {
      const received = Number(payment.amount);
      const applied = paymentAppliedAmount(payment);
      const credit = paymentUnappliedCredit(payment);
      trend.activeCollections = roundMoney(trend.activeCollections + received);
      trend.amountAppliedToBills = roundMoney(trend.amountAppliedToBills + applied);
      trend.unappliedCredit = roundMoney(trend.unappliedCredit + credit);
      const method = methodMap.get(payment.method) ?? { method: payment.method, label: paymentMethodLabel(payment.method), transactionCount: 0, totalAmount: 0 };
      method.transactionCount += 1;
      method.totalAmount = roundMoney(method.totalAmount + received);
      methodMap.set(payment.method, method);
    } else {
      trend.voidedCollections = roundMoney(trend.voidedCollections + Number(payment.amount));
    }
  }

  const paymentMethods = [...methodMap.values()]
    .map((row) => ({ ...row, percentage: activeCollections > 0 ? roundRate((row.totalAmount / activeCollections) * 100) : 0 }))
    .sort((left, right) => right.totalAmount - left.totalAmount || left.label.localeCompare(right.label));

  const revenueMap = new Map<RecurringChargeType, RevenueRow>();
  for (const type of Object.values(RecurringChargeType)) revenueMap.set(type, { key: type, label: recurringChargeLabel(type), billedAmount: 0, collectedAmount: 0, outstandingAmount: 0 });
  for (const bill of periodBills) {
    const row = revenueMap.get(bill.recurringChargeType)!;
    row.billedAmount = roundMoney(row.billedAmount + Number(bill.totalAmount));
    row.outstandingAmount = roundMoney(row.outstandingAmount + (balanceByBill.get(bill.id) ?? 0));
  }
  for (const payment of activePayments) {
    if (payment.allocations.length) {
      for (const allocation of payment.allocations) {
        const row = revenueMap.get(allocation.bill.recurringChargeType)!;
        row.collectedAmount = roundMoney(row.collectedAmount + Number(allocation.amount));
      }
    } else if (payment.bill) {
      const row = revenueMap.get(payment.bill.recurringChargeType)!;
      row.collectedAmount = roundMoney(row.collectedAmount + Number(payment.amount));
    }
  }
  const otherCollectionAmount = roundMoney(Number(otherCollections._sum.amount ?? 0));
  const revenueBreakdown = [...revenueMap.values()].filter((row) => row.billedAmount || row.collectedAmount || row.outstandingAmount);
  if (otherCollectionAmount > 0) revenueBreakdown.push({ key: "OTHER_COLLECTIONS", label: "Other collections", billedAmount: otherCollectionAmount, collectedAmount: otherCollectionAmount, outstandingAmount: 0 });

  const recentActivity = buildRecentActivity(payments, billingRuns, paymentRequests).slice(0, 30);
  const reconciliationVariance = roundMoney(activeCollections - amountAppliedToBills - unappliedCredit);

  return {
    generatedAt: new Date(),
    range,
    kpis: {
      totalBilled,
      activeCollections,
      voidedCollections,
      netCollections: activeCollections,
      outstandingReceivables,
      collectionRate: totalBilled > 0 ? roundRate((amountAppliedToBills / totalBilled) * 100) : 0,
      unappliedCredit,
      activeReceiptCount: activePayments.length,
      voidedReceiptCount: voidedPayments.length,
      pendingPaymentRequestCount: pendingPaymentRequests,
    },
    reconciliation: {
      totalBilled,
      amountAppliedToBills,
      unappliedCredit,
      activePaymentReceived: activeCollections,
      voidedPaymentReceived: voidedCollections,
      outstandingReceivables,
      variance: reconciliationVariance,
      balanced: Math.abs(reconciliationVariance) <= 0.01,
      tolerance: 0.01,
    },
    monthlyTrend,
    aging: receivablesAgingBuckets.map((bucket) => aging[bucket.key]),
    paymentMethods,
    revenueBreakdown,
    delinquent: {
      search,
      page: currentPage,
      pageCount,
      pageSize,
      totalCount: filteredDelinquent.length,
      rows: delinquentRows,
      exportRows: allDelinquent.slice(0, 25),
    },
    recentActivity,
  };
}

async function loadSelectedPayments(tenantId: string, from: Date, to: Date) {
  const rows: SelectedPayment[] = [];
  let cursor: string | undefined;
  do {
    const page = await prisma.payment.findMany({
      where: { tenantId, paymentDate: { gte: from, lte: to } },
      select: selectedPaymentSelect,
      orderBy: { id: "asc" },
      take: queryPageSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    rows.push(...page);
    cursor = page.length === queryPageSize ? page.at(-1)?.id : undefined;
  } while (cursor);
  return rows;
}

async function loadBillsAsOf(tenantId: string, asOf: Date) {
  const rows: BillAsOf[] = [];
  let cursor: string | undefined;
  const paymentAsOf = {
    tenantId,
    paymentDate: { lte: asOf },
    OR: [
      { status: PaymentStatus.ACTIVE },
      { status: PaymentStatus.VOIDED, voidedAt: { gt: asOf } },
    ],
  };
  do {
    const page = await prisma.bill.findMany({
      where: { tenantId, archivedAt: null, billingMonth: { lte: asOf }, createdAt: { lte: asOf } },
      select: {
        ...billAsOfSelect,
        paymentAllocations: { where: { tenantId, payment: paymentAsOf }, select: billAsOfSelect.paymentAllocations.select },
        payments: { where: { ...paymentAsOf, allocations: { none: {} } }, select: billAsOfSelect.payments.select },
      },
      orderBy: { id: "asc" },
      take: queryPageSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    rows.push(...page);
    cursor = page.length === queryPageSize ? page.at(-1)?.id : undefined;
  } while (cursor);
  return rows;
}

function createMonthlyTrend(from: Date, to: Date) {
  const rows: MonthlyTrendRow[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cursor <= last) {
    rows.push({
      key: monthKey(cursor),
      label: cursor.toLocaleDateString("en-PH", { month: "short", year: "numeric", timeZone: "UTC" }),
      activeCollections: 0,
      amountAppliedToBills: 0,
      unappliedCredit: 0,
      voidedCollections: 0,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return rows;
}

function buildRecentActivity(
  payments: SelectedPayment[],
  billingRuns: Array<{ createdAt: Date; metadata: unknown; actor: { name: string } | null }>,
  requests: Array<{ createdAt: Date; amount: unknown; status: string; referenceNumber: string | null; homeowner: { user: { name: string } }; reviewedBy: { name: string } | null }>,
) {
  const rows: ActivityRow[] = [];
  for (const payment of payments) {
    rows.push({
      date: payment.createdAt,
      type: "Payment",
      homeowner: payment.homeowner.user.name,
      reference: payment.receiptNumber || payment.referenceNumber || "Receipt pending",
      amount: Number(payment.amount),
      actor: payment.processedBy?.name ?? "Authorized collector",
      status: payment.status === PaymentStatus.ACTIVE ? "Active" : "Voided",
    });
    const credit = payment.status === PaymentStatus.ACTIVE ? paymentUnappliedCredit(payment) : 0;
    if (credit > 0) rows.push({ date: payment.createdAt, type: "Credit", homeowner: payment.homeowner.user.name, reference: payment.receiptNumber || payment.referenceNumber || "Receipt pending", amount: credit, actor: payment.processedBy?.name ?? "Authorized collector", status: "Available" });
    if (payment.status === PaymentStatus.VOIDED && payment.voidedAt) rows.push({ date: payment.voidedAt, type: "Void", homeowner: payment.homeowner.user.name, reference: payment.receiptNumber || payment.referenceNumber || "Receipt pending", amount: Number(payment.amount), actor: payment.voidedBy?.name ?? "Authorized officer", status: "Voided" });
  }
  for (const run of billingRuns) {
    const metadata = asRecord(run.metadata);
    rows.push({
      date: run.createdAt,
      type: "Billing generation",
      homeowner: `${numericMetadata(metadata, "createdCount")} homeowner${numericMetadata(metadata, "createdCount") === 1 ? "" : "s"}`,
      reference: billingRunReference(metadata),
      amount: numericMetadata(metadata, "totalAmount"),
      actor: run.actor?.name ?? "Automated billing",
      status: numericMetadata(metadata, "failedCount") > 0 ? "Completed with errors" : "Completed",
    });
  }
  for (const request of requests) rows.push({ date: request.createdAt, type: "Payment request", homeowner: request.homeowner.user.name, reference: request.referenceNumber || "No external reference", amount: Number(request.amount), actor: request.reviewedBy?.name ?? request.homeowner.user.name, status: titleCase(request.status) });
  return rows.sort((left, right) => right.date.valueOf() - left.date.valueOf() || left.type.localeCompare(right.type));
}

function validateDateInput(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FinanceDashboardInputError(`${label} must use the YYYY-MM-DD format.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new FinanceDashboardInputError(`${label} is not a valid calendar date.`);
  return value;
}

function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function agingLabel(key: ReceivablesAgingBucket) {
  return receivablesAgingBuckets.find((bucket) => bucket.key === key)?.label ?? "Current";
}

function paymentMethodLabel(method: PaymentMethod) {
  if (method === PaymentMethod.GCASH) return "GCash";
  return titleCase(method);
}

function recurringChargeLabel(type: RecurringChargeType) {
  return titleCase(type);
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").toLocaleLowerCase("en-PH").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function positiveInteger(value: string | number | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numericMetadata(metadata: Record<string, unknown>, key: string) {
  const value = Number(metadata[key]);
  return Number.isFinite(value) ? value : 0;
}

function billingRunReference(metadata: Record<string, unknown>) {
  const year = numericMetadata(metadata, "coverageYear");
  const month = numericMetadata(metadata, "coverageMonth");
  if (year >= 1900 && month >= 1 && month <= 12) return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
  return "Billing run";
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRate(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

type AgingRow = { key: ReceivablesAgingBucket; label: string; amount: number; billCount: number };
type DelinquentAccumulator = { homeownerId: string; homeownerName: string; accountNumber: string; block: string; lot: string; outstandingBalance: number; oldestUnpaidDate: Date };
type MonthlyTrendRow = { key: string; label: string; activeCollections: number; amountAppliedToBills: number; unappliedCredit: number; voidedCollections: number };
type RevenueRow = { key: RecurringChargeType | "OTHER_COLLECTIONS"; label: string; billedAmount: number; collectedAmount: number; outstandingAmount: number };
type ActivityRow = { date: Date; type: string; homeowner: string; reference: string; amount: number; actor: string; status: string };

export type FinanceDashboardData = Awaited<ReturnType<typeof getFinanceDashboard>>;
