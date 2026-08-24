import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PayrollPostingEventType, PayrollRevisionType } from "@prisma/client";
import { assertBalancedJournal, buildPayrollJournalLines } from "../../lib/services/payroll-finance";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260824190000_payroll_financial_posting/migration.sql"), "utf8");
const actions = readFileSync(resolve(process.cwd(), "lib/actions/payroll.ts"), "utf8");
const service = readFileSync(resolve(process.cwd(), "lib/services/payroll-finance.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "app/admin/payroll/page.tsx"), "utf8");

const statutorySnapshot = {
  statutoryDeduction: 1728.7,
  sssEmployeeContribution: 750,
  sssEmployerContribution: 1500,
  employeeCompensationContribution: 15,
  philHealthEmployeeContribution: 375,
  philHealthEmployerContribution: 375,
  pagIbigEmployeeContribution: 100,
  pagIbigEmployerContribution: 100,
  withholdingTax: 503.7,
};

test("PAY-FIN-001: finalized payroll accrual builds an exact balanced journal", () => {
  const lines = buildPayrollJournalLines({
    eventType: PayrollPostingEventType.POST,
    revisionType: PayrollRevisionType.INITIAL,
    payslips: [{ snapshot: statutorySnapshot, grossPay: 15000, deduction: 1728.7, netPay: 13271.3 }],
  });
  assert.deepEqual(assertBalancedJournal(lines), { debit: 16990, credit: 16990 });
  assert.equal(lines.find((line) => line.accountCode === "5100")?.debit, 15000);
  assert.equal(lines.find((line) => line.accountCode === "2100")?.credit, 13271.3);
  assert.equal(lines.find((line) => line.accountCode === "2120")?.credit, 2265);
});

test("PAY-FIN-001 PAY-LOAN-001: payment clears net payroll and loan deductions without changing expense", () => {
  const lines = buildPayrollJournalLines({
    eventType: PayrollPostingEventType.PAYMENT,
    revisionType: PayrollRevisionType.INITIAL,
    payslips: [{ snapshot: statutorySnapshot, grossPay: 15000, deduction: 2728.7, netPay: 12271.3 }],
    loanRepaymentAmount: 1000,
  });
  assert.deepEqual(assertBalancedJournal(lines), { debit: 13271.3, credit: 13271.3 });
  assert.equal(lines.find((line) => line.accountCode === "1010")?.credit, 12271.3);
  assert.equal(lines.find((line) => line.accountCode === "1210")?.credit, 1000);
  assert.equal(lines.some((line) => line.accountCode.startsWith("51")), false);
});

test("PAY-FIN-003: paid payroll reversal uses recovery receivable and balances against immutable source evidence", () => {
  const lines = buildPayrollJournalLines({
    eventType: PayrollPostingEventType.REVERSAL,
    revisionType: PayrollRevisionType.REVERSAL,
    payslips: [{ snapshot: { sourceSnapshot: statutorySnapshot }, grossPay: -15000, deduction: -1728.7, netPay: -13271.3 }],
    paymentWasPosted: true,
  });
  assert.deepEqual(assertBalancedJournal(lines), { debit: 16990, credit: 16990 });
  assert.equal(lines.find((line) => line.accountCode === "1220")?.debit, 13271.3);
  assert.equal(lines.find((line) => line.accountCode === "5100")?.credit, 15000);
});

test("PAY-FIN-003 PAY-LOAN-001: paid reversal restores the loan receivable instead of reopening deduction clearing", () => {
  const lines = buildPayrollJournalLines({
    eventType: PayrollPostingEventType.REVERSAL,
    revisionType: PayrollRevisionType.REVERSAL,
    payslips: [{ snapshot: { sourceSnapshot: statutorySnapshot }, grossPay: -15000, deduction: -2728.7, netPay: -12271.3 }],
    loanRepaymentAmount: 1000,
    paymentWasPosted: true,
  });
  assert.deepEqual(assertBalancedJournal(lines), { debit: 16990, credit: 16990 });
  assert.equal(lines.find((line) => line.accountCode === "1210")?.debit, 1000);
  assert.equal(lines.some((line) => line.accountCode === "2150"), false);
});

test("PAY-FIN-002: schema and migration enforce durable tenant/revision/event idempotency", () => {
  assert.match(schema, /model PayrollPostingOutbox/);
  assert.match(schema, /model PayrollFinancialPosting/);
  assert.match(schema, /model FinancialJournalEntry/);
  assert.match(schema, /@@unique\(\[tenantId, revisionId, eventType\], map: "PayrollFinPost_scope_revision_key"\)/);
  assert.match(migration, /UNIQUE INDEX `PayrollOutbox_scope_idem_key`/);
  assert.match(migration, /UNIQUE INDEX `PayrollFinPost_scope_revision_key`/);
  assert.match(service, /payroll-finance:\$\{input\.tenantId\}:\$\{revision\.id\}:\$\{input\.eventType\}/);
  assert.match(service, /status: PayrollOutboxStatus\.COMPLETED/);
  assert.match(service, /status: PayrollStatus\.POST_FAILED/);
});

test("PAY-FIN-001 PAY-FIN-003: actions and UI enforce post, payment, retry, and reversal sequencing", () => {
  assert.match(actions, /postPayrollToFinanceAction/);
  assert.match(actions, /eventType: PayrollPostingEventType\.POST/);
  assert.match(actions, /eventType: PayrollPostingEventType\.PAYMENT/);
  assert.match(actions, /postPayrollReversalToFinanceAction/);
  assert.doesNotMatch(actions.slice(actions.indexOf("export async function markPayrollPaidAction"), actions.indexOf("export async function postPayrollReversalToFinanceAction")), /payrollPeriod\.update/);
  assert.match(page, /Post to Financial Engine/);
  assert.match(page, /Record net-pay disbursement/);
  assert.match(page, /Retry Financial Engine post/);
  assert.match(page, /Financial Engine reconciliation/);
});
