import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const panel = readFileSync(resolve(process.cwd(), "components/payroll-cutoff-deductions-panel.tsx"), "utf8");
const payrollPage = readFileSync(resolve(process.cwd(), "app/admin/payroll/page.tsx"), "utf8");

test("PAY-DED-001 PAY-RUN-001: cutoff adjustments use the canonical draft/calculated mutability policy", () => {
  assert.match(panel, /isPayrollMutable\(payrollStatus\)/);
  assert.match(panel, /payrollIsMutable && canWritePayroll/);
  assert.doesNotMatch(panel, /payrollStatus === "DRAFT" && canWritePayroll/);
  assert.match(panel, /Saving or removing a deduction recalculates the affected payroll results automatically/);
});

test("PAY-RUN-003: immutable payroll directs the user to the controlled correction workflow", () => {
  assert.match(panel, /Begin a controlled correction before changing employee deductions/);
  assert.doesNotMatch(panel, /Return this payroll period to draft before changing employee deductions/);
});

test("PAY-RUN-003 PAY-FIN-003: finalized payroll cannot enter an unpostable reversal dead end", () => {
  const finalizedBlock = payrollPage.slice(payrollPage.indexOf('selected.status === "FINALIZED"'), payrollPage.indexOf('selected.status === "POST_FAILED"'));
  assert.match(finalizedBlock, /returnPayrollToDraftAction/);
  assert.match(finalizedBlock, /postPayrollToFinanceAction/);
  assert.doesNotMatch(finalizedBlock, /recordPayrollReversalAction/);
  assert.match(payrollPage, /reversed && step === "Pay" \? "Reverse" : step/);
});
