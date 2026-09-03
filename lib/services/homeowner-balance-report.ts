import { HomeownerStatus, PaymentStatus, RecurringChargeType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { paymentCoverageLabel } from "@/lib/payment-coverage";
import { inputDate, monthLabel } from "@/lib/utils";

export type HomeownerBalanceStatusFilter = "ALL" | HomeownerStatus;
export type HomeownerPaymentStanding = "FULL_PAID" | "PARTIAL" | "NONE_PAYMENT" | "NO_BILL";

export type HomeownerBalanceReportRow = {
  homeownerId: string;
  accountNumber: string;
  homeownerName: string;
  email: string;
  block: string;
  lot: string;
  phase: string;
  status: HomeownerStatus;
  monthlyDuesAmount: number;
  totalBill: number;
  totalPaid: number;
  currentBalance: number;
  billCount: number;
  paidBillCount: number;
  paymentStanding: HomeownerPaymentStanding;
  remarks: string;
};

export type HomeownerBalanceBlockAnalytics = {
  block: string;
  homeowners: number;
  totalBill: number;
  totalPaid: number;
  currentBalance: number;
  collectionRatePct: number;
};

export type HomeownerBalanceAnalytics = {
  homeowners: number;
  totalBill: number;
  totalPaid: number;
  currentBalance: number;
  collectionRatePct: number;
  fullyPaidHomeowners: number;
  partialHomeowners: number;
  nonePaymentHomeowners: number;
  noBillHomeowners: number;
  averageOutstandingBalance: number;
  byBlock: HomeownerBalanceBlockAnalytics[];
  topOutstanding: HomeownerBalanceReportRow[];
  boardReviewHighlights: string[];
};

type PaymentDetail = {
  paymentId: string;
  receiptNumber: string | null;
  paymentDate: Date;
  amount: number;
  coverage: string;
};

// lib/db.ts intentionally applies a safety default of take=500 to tenant-model
// findMany calls that do not set take explicitly. Reports must therefore page
// explicitly so large tenants are never silently truncated at 500 homeowners.
export const HOMEOWNER_BALANCE_REPORT_BATCH_SIZE = 500;

export async function getHomeownerBalanceReport(tenantId: string, fromInput?: string | null, toInput?: string | null, statusInput?: string | null) {
  const { from, to, fromText, toText } = parseReportDateRange(fromInput, toInput);
  const status = parseHomeownerBalanceStatus(statusInput);
  const where = {
    tenantId,
    ...(status === "ALL" ? {} : { status }),
  };

  const [expectedHomeownerCount, tenant] = await Promise.all([
    prisma.homeownerProfile.count({ where }),
    prisma.tenant.findFirst({ where: { id: tenantId }, select: { name: true, address: true } }),
  ]);
  const rows: HomeownerBalanceReportRow[] = [];
  let cursor: string | undefined;

  while (true) {
    const homeowners = await prisma.homeownerProfile.findMany({
      where,
      include: {
        user: true,
        bills: {
          where: {
            tenantId,
            archivedAt: null,
            recurringChargeType: RecurringChargeType.MONTHLY_DUES,
            billingMonth: { gte: from, lte: to },
          },
          include: {
            payments: {
              where: { tenantId, status: PaymentStatus.ACTIVE },
              orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
            },
            paymentAllocations: {
              where: { tenantId, payment: { status: PaymentStatus.ACTIVE } },
              include: { payment: true },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: [{ billingMonth: "asc" }, { dueDate: "asc" }],
        },
      },
      orderBy: { id: "asc" },
      take: HOMEOWNER_BALANCE_REPORT_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    for (const homeowner of homeowners) {
      const totalBill = roundMoney(homeowner.bills.reduce((sum, bill) => sum + Number(bill.totalAmount), 0));
      const totalPaid = roundMoney(homeowner.bills.reduce((sum, bill) => sum + Number(bill.amountPaid), 0));
      const currentBalance = roundMoney(homeowner.bills.reduce((sum, bill) => sum + Number(bill.balance), 0));
      const billCount = homeowner.bills.length;
      const paidBillCount = homeowner.bills.filter((bill) => Number(bill.balance) <= 0).length;
      const paymentDetails = homeowner.bills.flatMap((bill) => {
        const details = new Map<string, PaymentDetail>();
        for (const allocation of bill.paymentAllocations) {
          details.set(allocation.payment.id, {
            paymentId: allocation.payment.id,
            receiptNumber: allocation.payment.receiptNumber,
            paymentDate: allocation.payment.paymentDate,
            amount: Number(allocation.amount),
            coverage: allocation.coverageLabel?.trim() || monthLabel(bill.billingMonth),
          });
        }
        for (const payment of bill.payments) {
          if (!details.has(payment.id)) {
            details.set(payment.id, {
              paymentId: payment.id,
              receiptNumber: payment.receiptNumber,
              paymentDate: payment.paymentDate,
              amount: Number(payment.amount),
              coverage: paymentCoverageLabel({ ...payment, billingMonth: bill.billingMonth }),
            });
          }
        }
        return formatBillPaymentRemarks(Number(bill.totalAmount), [...details.values()]);
      });
      const paymentStanding = homeownerPaymentStanding({ totalBill, totalPaid, currentBalance, billCount });
      rows.push({
        homeownerId: homeowner.id,
        accountNumber: homeownerAccountNumber(homeowner),
        homeownerName: homeowner.user.name,
        email: homeowner.user.email,
        block: homeowner.block,
        lot: homeowner.lot,
        phase: homeowner.phase ?? "",
        status: homeowner.status,
        monthlyDuesAmount: Number(homeowner.monthlyDuesAmount),
        totalBill,
        totalPaid,
        currentBalance,
        billCount,
        paidBillCount,
        paymentStanding,
        remarks: homeownerPaymentRemarks(paymentDetails),
      });
    }

    if (homeowners.length < HOMEOWNER_BALANCE_REPORT_BATCH_SIZE) break;
    cursor = homeowners[homeowners.length - 1]?.id;
    if (!cursor) break;
  }

  if (rows.length !== expectedHomeownerCount) {
    throw new Error(`Homeowner balance report integrity check failed: expected ${expectedHomeownerCount} homeowner(s), retrieved ${rows.length}. Please retry the export.`);
  }

  rows.sort((a, b) =>
    a.status.localeCompare(b.status) ||
    a.homeownerName.localeCompare(b.homeownerName) ||
    a.block.localeCompare(b.block, undefined, { numeric: true }) ||
    a.lot.localeCompare(b.lot, undefined, { numeric: true }),
  );

  const totals = rows.reduce((summary, row) => ({
    homeowners: summary.homeowners + 1,
    totalBill: roundMoney(summary.totalBill + row.totalBill),
    totalPaid: roundMoney(summary.totalPaid + row.totalPaid),
    currentBalance: roundMoney(summary.currentBalance + row.currentBalance),
  }), { homeowners: 0, totalBill: 0, totalPaid: 0, currentBalance: 0 });
  const analytics = buildHomeownerBalanceAnalytics(rows, fromText, toText, status);

  return {
    from,
    to,
    fromText,
    toText,
    status,
    tenant: { name: tenant?.name ?? "HOA", address: tenant?.address ?? "" },
    rows,
    totals,
    analytics,
  };
}

export function parseHomeownerBalanceStatus(value: string | null | undefined): HomeownerBalanceStatusFilter {
  return value === HomeownerStatus.ACTIVE || value === HomeownerStatus.INACTIVE ? value : "ALL";
}

export function parseReportDateRange(fromInput?: string | null, toInput?: string | null) {
  const now = new Date();
  const fromText = /^\d{4}-\d{2}-\d{2}$/.test(fromInput ?? "") ? fromInput! : `${now.getUTCFullYear()}-01-01`;
  const toText = /^\d{4}-\d{2}-\d{2}$/.test(toInput ?? "") ? toInput! : inputDate(now);
  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  if (from > to) throw new Error("Report start date must be on or before the end date.");
  return { from, to, fromText, toText };
}

export function homeownerPaymentStanding(input: { totalBill: number; totalPaid: number; currentBalance: number; billCount: number }): HomeownerPaymentStanding {
  if (!input.billCount || input.totalBill <= 0) return "NO_BILL";
  if (input.totalPaid <= 0) return "NONE_PAYMENT";
  if (input.currentBalance <= 0) return "FULL_PAID";
  return "PARTIAL";
}

export function homeownerPaymentRemarks(details: string[]) {
  return details.length ? details.join("\n") : "None Payment";
}

export function formatBillPaymentRemarks(billTotal: number, details: PaymentDetail[]) {
  const sorted = [...details].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime() || a.paymentId.localeCompare(b.paymentId));
  let applied = 0;
  return sorted.map((detail) => {
    applied = roundMoney(applied + detail.amount);
    const paymentStatus = applied >= roundMoney(billTotal) ? "Full Paid" : "Partial";
    return `Receipt No. ${detail.receiptNumber || "N/A"} | Date of Payment ${inputDate(detail.paymentDate)} | Amount ${formatPhp(detail.amount)} | Payment Coverage: ${detail.coverage} | ${paymentStatus}`;
  });
}

export function buildHomeownerBalanceAnalytics(rows: HomeownerBalanceReportRow[], fromText: string, toText: string, status: HomeownerBalanceStatusFilter): HomeownerBalanceAnalytics {
  const totalBill = roundMoney(rows.reduce((sum, row) => sum + row.totalBill, 0));
  const totalPaid = roundMoney(rows.reduce((sum, row) => sum + row.totalPaid, 0));
  const currentBalance = roundMoney(rows.reduce((sum, row) => sum + row.currentBalance, 0));
  const collectionRatePct = totalBill > 0 ? roundMoney((totalPaid / totalBill) * 100) : 0;
  const fullyPaidHomeowners = rows.filter((row) => row.paymentStanding === "FULL_PAID").length;
  const partialHomeowners = rows.filter((row) => row.paymentStanding === "PARTIAL").length;
  const nonePaymentHomeowners = rows.filter((row) => row.paymentStanding === "NONE_PAYMENT").length;
  const noBillHomeowners = rows.filter((row) => row.paymentStanding === "NO_BILL").length;
  const outstandingRows = rows.filter((row) => row.currentBalance > 0);
  const averageOutstandingBalance = outstandingRows.length ? roundMoney(currentBalance / outstandingRows.length) : 0;

  const blocks = new Map<string, HomeownerBalanceBlockAnalytics>();
  for (const row of rows) {
    const block = row.block || "Unspecified";
    const existing = blocks.get(block) ?? { block, homeowners: 0, totalBill: 0, totalPaid: 0, currentBalance: 0, collectionRatePct: 0 };
    existing.homeowners += 1;
    existing.totalBill = roundMoney(existing.totalBill + row.totalBill);
    existing.totalPaid = roundMoney(existing.totalPaid + row.totalPaid);
    existing.currentBalance = roundMoney(existing.currentBalance + row.currentBalance);
    blocks.set(block, existing);
  }
  const byBlock = [...blocks.values()].map((block) => ({
    ...block,
    collectionRatePct: block.totalBill > 0 ? roundMoney((block.totalPaid / block.totalBill) * 100) : 0,
  })).sort((a, b) => b.currentBalance - a.currentBalance || a.block.localeCompare(b.block, undefined, { numeric: true }));
  const topOutstanding = [...outstandingRows].sort((a, b) => b.currentBalance - a.currentBalance || a.homeownerName.localeCompare(b.homeownerName)).slice(0, 10);
  const scope = status === "ALL" ? "active and inactive" : status.toLowerCase();
  const boardReviewHighlights = [
    `Report scope: ${rows.length} ${scope} homeowner account(s), covering Monthly Dues billed from ${fromText} through ${toText}.`,
    `Monthly Dues billed total ${formatPhp(totalBill)}; recorded payments total ${formatPhp(totalPaid)}, for an overall collection rate of ${collectionRatePct.toFixed(2)}%.`,
    `Outstanding Monthly Dues total ${formatPhp(currentBalance)}. ${partialHomeowners} account(s) are partially paid and ${nonePaymentHomeowners} account(s) have None Payment in the selected billing period.`,
    `${fullyPaidHomeowners} homeowner account(s) are fully paid. ${noBillHomeowners} account(s) have no Monthly Dues bill in the selected billing period.`,
    `Board collection review should prioritize the highest outstanding homeowner accounts and blocks listed in the analytics schedules below.`,
  ];

  return {
    homeowners: rows.length,
    totalBill,
    totalPaid,
    currentBalance,
    collectionRatePct,
    fullyPaidHomeowners,
    partialHomeowners,
    nonePaymentHomeowners,
    noBillHomeowners,
    averageOutstandingBalance,
    byBlock,
    topOutstanding,
    boardReviewHighlights,
  };
}

export function homeownerBalanceRemarks(input: { status: HomeownerStatus; billCount: number; paidBillCount: number; currentBalance: number }) {
  const parts = [input.status === HomeownerStatus.ACTIVE ? "Active homeowner" : "Inactive homeowner"];
  if (!input.billCount) parts.push("No Monthly Dues bills in selected period");
  else if (input.currentBalance <= 0) parts.push("Fully paid for selected period");
  else if (input.paidBillCount > 0) parts.push("Partially paid with outstanding balance");
  else parts.push("Unpaid Monthly Dues balance");
  return parts.join("; ");
}

export function formatPhp(value: number) {
  return `PHP ${roundMoney(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
