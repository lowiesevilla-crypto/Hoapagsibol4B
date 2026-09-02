import { HomeownerStatus, RecurringChargeType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { inputDate } from "@/lib/utils";

export type HomeownerBalanceStatusFilter = "ALL" | HomeownerStatus;

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
  remarks: string;
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

  const expectedHomeownerCount = await prisma.homeownerProfile.count({ where });
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
        remarks: homeownerBalanceRemarks({ status: homeowner.status, billCount, paidBillCount, currentBalance }),
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

  return { from, to, fromText, toText, status, rows, totals };
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

export function homeownerBalanceRemarks(input: { status: HomeownerStatus; billCount: number; paidBillCount: number; currentBalance: number }) {
  const parts = [input.status === HomeownerStatus.ACTIVE ? "Active homeowner" : "Inactive homeowner"];
  if (!input.billCount) parts.push("No Monthly Dues bills in selected period");
  else if (input.currentBalance <= 0) parts.push("Fully paid for selected period");
  else if (input.paidBillCount > 0) parts.push("Partially paid with outstanding balance");
  else parts.push("Unpaid Monthly Dues balance");
  return parts.join("; ");
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
