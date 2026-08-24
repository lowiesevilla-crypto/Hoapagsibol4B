import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { calculatePettyCashDeductionAmount } from "../../lib/petty-cash/payroll-integration";

const payrollActions = readFileSync(resolve(process.cwd(), "lib/actions/payroll.ts"), "utf8");
const integration = readFileSync(resolve(process.cwd(), "lib/petty-cash/payroll-integration.ts"), "utf8");

test("PCV-007: configured deduction is used when sufficient unreserved loan balance remains", () => {
  assert.equal(calculatePettyCashDeductionAmount(500, 5000, 0), 500);
});

test("PCV-007: final cutoff is reduced to the remaining available balance", () => {
  assert.equal(calculatePettyCashDeductionAmount(500, 325.25, 0), 325.25);
});

test("PCV-007: existing unpaid payroll reservations reduce the next automatic deduction", () => {
  assert.equal(calculatePettyCashDeductionAmount(500, 1000, 750), 250);
  assert.equal(calculatePettyCashDeductionAmount(500, 1000, 1000), 0);
});

test("PCV-007: schedule math is non-negative and cent-rounded", () => {
  assert.equal(calculatePettyCashDeductionAmount(-100, 1000, 0), 0);
  assert.equal(calculatePettyCashDeductionAmount(1000, 100.005, 0), 100.01);
  assert.equal(calculatePettyCashDeductionAmount(500, 200, 250), 0);
});

test("PCV-007 PAY-DED-001 PAY-LOAN-001: payroll calculation materializes Petty Cash deductions before reading assigned deductions", () => {
  const materialize = payrollActions.indexOf("await materializePettyCashPayrollDeductions(tx, period);");
  const assigned = payrollActions.indexOf("const assignedDeductions = await tx.payrollDeduction.findMany");
  assert.ok(materialize > 0, "Payroll calculation must materialize Petty Cash scheduled deductions.");
  assert.ok(assigned > materialize, "Petty Cash deductions must exist before payslip deduction inputs are read.");
  assert.match(integration, /payroll:\s*\{ status:\s*\{ not:\s*PayrollStatus\.PAID \}/);
  assert.match(integration, /employeeLoanId:\s*loan\.id/);
});
