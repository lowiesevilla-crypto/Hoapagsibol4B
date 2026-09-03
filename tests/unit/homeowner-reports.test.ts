import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HomeownerStatus } from "@prisma/client";
import {
  HOMEOWNER_BALANCE_REPORT_BATCH_SIZE,
  formatBillPaymentRemarks,
  homeownerPaymentRemarks,
  homeownerPaymentStanding,
  parseHomeownerBalanceStatus,
} from "../../lib/services/homeowner-balance-report";
import { createXlsxWorkbook } from "../../lib/xlsx-workbook";

const financialReportPage = readFileSync("app/admin/reports/page.tsx", "utf8");
const reportsLayout = readFileSync("app/admin/reports/layout.tsx", "utf8");
const balancePage = readFileSync("app/admin/reports/homeowner-balances/page.tsx", "utf8");
const transactionPage = readFileSync("app/admin/reports/transactions/page.tsx", "utf8");
const balanceRoute = readFileSync("app/admin/reports/homeowner-balances/export/route.ts", "utf8");
const transactionRoute = readFileSync("app/admin/reports/transactions/export/route.ts", "utf8");
const balanceService = readFileSync("lib/services/homeowner-balance-report.ts", "utf8");
const transactionService = readFileSync("lib/services/transaction-history-report.ts", "utf8");
const dbSource = readFileSync("lib/db.ts", "utf8");

test("reports are separated into three dedicated views", () => {
  assert.match(financialReportPage, /title="HOA Financial Report"/);
  assert.doesNotMatch(financialReportPage, /Downloadable report center/);
  assert.doesNotMatch(financialReportPage, /Homeowner Monthly Dues Balance Report/);
  assert.doesNotMatch(financialReportPage, /Transaction History Report/);
  assert.match(reportsLayout, /href="\/admin\/reports"[^>]*>HOA Financial Report/);
  assert.match(reportsLayout, /href="\/admin\/reports\/homeowner-balances"[^>]*>Homeowner Monthly Dues Balance Report/);
  assert.match(reportsLayout, /href="\/admin\/reports\/transactions"[^>]*>Transaction History Report/);
  assert.match(balancePage, /title="Homeowner Monthly Dues Balance Report"/);
  assert.match(transactionPage, /title="Transaction History Report"/);
});

test("download routes use authenticated tenant only", () => {
  assert.match(balanceRoute, /requireUser\(Role\.ADMIN\)/);
  assert.match(balanceRoute, /getHomeownerBalanceReport\(user\.tenantId/);
  assert.doesNotMatch(balanceRoute, /searchParams\.get\("tenantId"\)/);
  assert.match(transactionRoute, /requireUser\(Role\.ADMIN\)/);
  assert.match(transactionRoute, /getTransactionHistoryReport\(user\.tenantId/);
  assert.doesNotMatch(transactionRoute, /searchParams\.get\("tenantId"\)/);
});

test("homeowner balance report is tenant scoped and includes name, block, lot and payment evidence", () => {
  assert.match(balanceService, /tenantId/);
  assert.match(balanceService, /recurringChargeType: RecurringChargeType\.MONTHLY_DUES/);
  assert.match(balanceService, /billingMonth: \{ gte: from, lte: to \}/);
  assert.match(balanceService, /homeownerName: homeowner\.user\.name/);
  assert.match(balanceService, /block: homeowner\.block/);
  assert.match(balanceService, /lot: homeowner\.lot/);
  assert.match(balanceService, /paymentAllocations/);
  assert.match(balanceService, /receiptNumber/);
  assert.match(balanceService, /paymentDate/);
  assert.match(balanceService, /Number\(allocation\.amount\)/);
  assert.match(balanceService, /coverageLabel/);
  assert.match(balanceService, /paymentCoverageLabel/);
  assert.match(balanceService, /status: PaymentStatus\.ACTIVE/);
});

test("homeowner balance export explicitly paginates beyond the tenant-model 500-row safety cap", () => {
  assert.equal(HOMEOWNER_BALANCE_REPORT_BATCH_SIZE, 500);
  assert.match(dbSource, /operation === "findMany" && scoped\.take === undefined\) scoped\.take = 500/);
  assert.match(balanceService, /expectedHomeownerCount/);
  assert.match(balanceService, /take: HOMEOWNER_BALANCE_REPORT_BATCH_SIZE/);
  assert.match(balanceService, /cursor: \{ id: cursor \}, skip: 1/);
  assert.match(balanceService, /rows\.length !== expectedHomeownerCount/);
  assert.match(balanceService, /integrity check failed/);
});

test("payment remarks contain receipt, payment date, amount, coverage and Full Paid or Partial", () => {
  const remarks = formatBillPaymentRemarks(1000, [
    { paymentId: "p1", receiptNumber: "OR-100", paymentDate: new Date("2026-08-05T00:00:00.000Z"), amount: 400, coverage: "August 2026" },
    { paymentId: "p2", receiptNumber: "OR-101", paymentDate: new Date("2026-08-10T00:00:00.000Z"), amount: 600, coverage: "August 2026" },
  ]);
  assert.deepEqual(remarks, [
    "Receipt No. OR-100 | Date of Payment 2026-08-05 | Amount PHP 400.00 | Payment Coverage: August 2026 | Partial",
    "Receipt No. OR-101 | Date of Payment 2026-08-10 | Amount PHP 600.00 | Payment Coverage: August 2026 | Full Paid",
  ]);
  assert.equal(homeownerPaymentRemarks([]), "None Payment");
  assert.equal(homeownerPaymentRemarks(remarks), remarks.join("\n"));
});

test("payment standing analytics classifications are deterministic", () => {
  assert.equal(homeownerPaymentStanding({ totalBill: 0, totalPaid: 0, currentBalance: 0, billCount: 0 }), "NO_BILL");
  assert.equal(homeownerPaymentStanding({ totalBill: 1000, totalPaid: 0, currentBalance: 1000, billCount: 1 }), "NONE_PAYMENT");
  assert.equal(homeownerPaymentStanding({ totalBill: 1000, totalPaid: 400, currentBalance: 600, billCount: 1 }), "PARTIAL");
  assert.equal(homeownerPaymentStanding({ totalBill: 1000, totalPaid: 1000, currentBalance: 0, billCount: 1 }), "FULL_PAID");
  assert.equal(parseHomeownerBalanceStatus("ACTIVE"), HomeownerStatus.ACTIVE);
  assert.equal(parseHomeownerBalanceStatus("INACTIVE"), HomeownerStatus.INACTIVE);
  assert.equal(parseHomeownerBalanceStatus("bad"), "ALL");
});

test("homeowner balance download is a two-sheet printable XLSX workbook", () => {
  assert.match(balanceRoute, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(balanceRoute, /\.xlsx/);
  assert.match(balanceRoute, /name: "Monthly Dues Balance"/);
  assert.match(balanceRoute, /name: "Summary & Analytics"/);
  assert.match(balanceRoute, /EXECUTIVE SUMMARY/);
  assert.match(balanceRoute, /KEY PERFORMANCE INDICATORS/);
  assert.match(balanceRoute, /OUTSTANDING BALANCE BY BLOCK/);
  assert.match(balanceRoute, /TOP OUTSTANDING HOMEOWNER ACCOUNTS/);
  const workbook = createXlsxWorkbook([{ name: "Summary & Analytics", rows: [["Board Review"]], orientation: "landscape" }]);
  assert.equal(workbook.subarray(0, 4).toString("hex"), "504b0304");
  assert.match(workbook.toString("utf8"), /Summary &amp; Analytics/);
  assert.match(workbook.toString("utf8"), /paperSize="9" orientation="landscape"/);
});

test("transaction report is tenant scoped and includes required payment columns", () => {
  assert.match(transactionService, /where: \{ tenantId, paymentDate: range \}/);
  assert.match(transactionService, /where: \{ tenantId, OR: \[\{ collectionDate: range \}/);
  assert.match(transactionService, /where: \{ tenantId, expenseDate: range \}/);
  assert.match(transactionService, /homeownerName: payment\.homeowner\.user\.name/);
  assert.match(transactionService, /block: payment\.homeowner\.block/);
  assert.match(transactionService, /lot: payment\.homeowner\.lot/);
  assert.match(transactionRoute, /Mode of Payment/);
  assert.match(transactionRoute, /Receipt No\./);
  assert.match(transactionRoute, /Remarks/);
});
