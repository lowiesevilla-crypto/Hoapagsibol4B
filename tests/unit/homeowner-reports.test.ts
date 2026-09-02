import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HomeownerStatus } from "@prisma/client";
import { homeownerBalanceRemarks, parseHomeownerBalanceStatus } from "../../lib/services/homeowner-balance-report";

const reportPage = readFileSync("app/admin/reports/page.tsx", "utf8");
const balanceRoute = readFileSync("app/admin/reports/homeowner-balances/export/route.ts", "utf8");
const transactionRoute = readFileSync("app/admin/reports/transactions/export/route.ts", "utf8");
const balanceService = readFileSync("lib/services/homeowner-balance-report.ts", "utf8");
const transactionService = readFileSync("lib/services/transaction-history-report.ts", "utf8");

test("reports page exposes homeowner balance and transaction history downloads", () => {
  assert.match(reportPage, /Homeowner Monthly Dues Balance Report/);
  assert.match(reportPage, /Transaction History Report/);
  assert.match(reportPage, /name="homeownerStatus"/);
  assert.match(reportPage, /\/admin\/reports\/homeowner-balances\/export/);
  assert.match(reportPage, /\/admin\/reports\/transactions\/export/);
});

test("download routes use authenticated tenant only", () => {
  assert.match(balanceRoute, /requireUser\(Role\.ADMIN\)/);
  assert.match(balanceRoute, /getHomeownerBalanceReport\(user\.tenantId/);
  assert.doesNotMatch(balanceRoute, /searchParams\.get\("tenantId"\)/);
  assert.match(transactionRoute, /requireUser\(Role\.ADMIN\)/);
  assert.match(transactionRoute, /getTransactionHistoryReport\(user\.tenantId/);
  assert.doesNotMatch(transactionRoute, /searchParams\.get\("tenantId"\)/);
});

test("homeowner balance report is tenant scoped and includes name, block, and lot", () => {
  assert.match(balanceService, /where: \{\s*tenantId/);
  assert.match(balanceService, /recurringChargeType: RecurringChargeType\.MONTHLY_DUES/);
  assert.match(balanceService, /billingMonth: \{ gte: from, lte: to \}/);
  assert.match(balanceService, /homeownerName: homeowner\.user\.name/);
  assert.match(balanceService, /block: homeowner\.block/);
  assert.match(balanceService, /lot: homeowner\.lot/);
  assert.match(balanceService, /totalAmount/);
  assert.match(balanceService, /amountPaid/);
  assert.match(balanceService, /balance/);
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

test("homeowner status parsing and remarks are deterministic", () => {
  assert.equal(parseHomeownerBalanceStatus("ACTIVE"), "ACTIVE");
  assert.equal(parseHomeownerBalanceStatus("INACTIVE"), "INACTIVE");
  assert.equal(parseHomeownerBalanceStatus("bad"), "ALL");
  assert.equal(homeownerBalanceRemarks({ status: HomeownerStatus.ACTIVE, billCount: 0, paidBillCount: 0, currentBalance: 0 }), "Active homeowner; No Monthly Dues bills in selected period");
  assert.equal(homeownerBalanceRemarks({ status: HomeownerStatus.ACTIVE, billCount: 2, paidBillCount: 2, currentBalance: 0 }), "Active homeowner; Fully paid for selected period");
  assert.equal(homeownerBalanceRemarks({ status: HomeownerStatus.INACTIVE, billCount: 3, paidBillCount: 1, currentBalance: 100 }), "Inactive homeowner; Partially paid with outstanding balance");
  assert.equal(homeownerBalanceRemarks({ status: HomeownerStatus.ACTIVE, billCount: 1, paidBillCount: 0, currentBalance: 100 }), "Active homeowner; Unpaid Monthly Dues balance");
});
