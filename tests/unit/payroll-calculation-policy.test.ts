import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePayslip,
  calculatePayslipWithPolicy,
  LEGACY_COMPATIBILITY_POLICY,
  validatePayrollCalculationPolicy,
  type PayrollCalculationPolicy,
} from "../../lib/services/payroll";

const employee = {
  salaryType: "DAILY" as const,
  baseRate: 800 as never,
  standardWorkDays: 26,
  fixedAllowance: 100 as never,
  fixedDeduction: 50 as never,
};

const attendance = [{
  status: "PRESENT" as const,
  lateMinutes: 60,
  undertimeMinutes: 0,
  nightDifferentialHours: 2 as never,
  isRestDay: true,
  holidayType: "REGULAR_HOLIDAY" as const,
}];

const policy: PayrollCalculationPolicy = {
  key: "UNIT_TEST_POLICY_V1",
  standardHoursPerDay: 8,
  overtimeMultiplier: 2,
  nightDifferentialRate: 0.2,
  restDayPremiumRate: 0.5,
  holidayPremiumRate: 1,
};

test("PAY-CALC-001/PAY-CALC-002: explicit policy deterministically controls premium calculation", () => {
  const inputDeductions = [{ amount: 250 as never }];
  const overtime = [{ hours: 2, source: "APPROVED_REQUEST" as const }];

  const first = calculatePayslipWithPolicy(employee, attendance, inputDeductions, overtime, policy);
  const second = calculatePayslipWithPolicy(employee, attendance, inputDeductions, overtime, policy);

  assert.deepEqual(first, second);
  assert.equal(first.basicPay, 700);
  assert.equal(first.overtimePay, 1640);
  assert.equal(first.allowance, 100);
  assert.equal(first.deduction, 300);
  assert.equal(first.grossPay, 2440);
  assert.equal(first.netPay, 2140);
  assert.equal(first.overtimeSource, "Approved OT Request");
});

test("PAY-CALC-002: legacy wrapper is explicitly equivalent to the named compatibility policy", () => {
  const viaWrapper = calculatePayslip(employee, attendance);
  const viaExplicitPolicy = calculatePayslipWithPolicy(employee, attendance, [], [], LEGACY_COMPATIBILITY_POLICY);
  assert.deepEqual(viaWrapper, viaExplicitPolicy);
});

test("PAY-CALC-002: invalid policy values fail closed", () => {
  assert.throws(
    () => validatePayrollCalculationPolicy({ ...policy, nightDifferentialRate: -0.01 }),
    /cannot be negative/i,
  );
  assert.throws(
    () => validatePayrollCalculationPolicy({ ...policy, standardHoursPerDay: 0 }),
    /standardHoursPerDay/i,
  );
});

test("PAY-CALC-003: basic pay and net pay never become negative", () => {
  const result = calculatePayslipWithPolicy(
    { ...employee, fixedAllowance: 0 as never, fixedDeduction: 5000 as never },
    [{ ...attendance[0], lateMinutes: 24 * 60, nightDifferentialHours: 0 as never, isRestDay: false, holidayType: null }],
    [],
    [],
    policy,
  );

  assert.equal(result.basicPay, 0);
  assert.equal(result.netPay, 0);
});
