import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PayrollDeductionScheduleMode } from "@prisma/client";
import { isDeductionScheduleEligible, scheduledDeductionAmount } from "../../lib/services/payroll-deduction-schedules";
import { calculateStatutoryContributions, resolveStatutoryApplicability, type PhilippineStatutoryRulesV1 } from "../../lib/services/payroll-statutory";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260824213000_payroll_schedules_statutory_controls/migration.sql"), "utf8");
const payrollActions = readFileSync(resolve(process.cwd(), "lib/actions/payroll.ts"), "utf8");
const adminPayroll = readFileSync(resolve(process.cwd(), "app/admin/payroll/page.tsx"), "utf8");
const employeeLoans = readFileSync(resolve(process.cwd(), "app/employee/loans/page.tsx"), "utf8");

test("PAY-DED-002: one-time and recurring eligibility obey dates and installment limits", () => {
  const from = new Date("2026-08-01T00:00:00.000Z");
  const cutoff = new Date("2026-08-15T00:00:00.000Z");
  assert.equal(isDeductionScheduleEligible({ mode: PayrollDeductionScheduleMode.ONE_TIME, effectiveFrom: from, effectiveTo: null, installmentLimit: 1 }, cutoff, 0), true);
  assert.equal(isDeductionScheduleEligible({ mode: PayrollDeductionScheduleMode.ONE_TIME, effectiveFrom: from, effectiveTo: null, installmentLimit: 1 }, cutoff, 1), false);
  assert.equal(isDeductionScheduleEligible({ mode: PayrollDeductionScheduleMode.RECURRING, effectiveFrom: from, effectiveTo: new Date("2026-08-31T00:00:00.000Z"), installmentLimit: 3 }, cutoff, 2), true);
  assert.equal(isDeductionScheduleEligible({ mode: PayrollDeductionScheduleMode.RECURRING, effectiveFrom: from, effectiveTo: new Date("2026-08-31T00:00:00.000Z"), installmentLimit: 3 }, cutoff, 3), false);
  assert.equal(isDeductionScheduleEligible({ mode: PayrollDeductionScheduleMode.RECURRING, effectiveFrom: from, effectiveTo: new Date("2026-08-10T00:00:00.000Z"), installmentLimit: null }, cutoff, 0), false);
});

test("PAY-LOAN-002: automatic repayment caps the final installment after unpaid reservations", () => {
  assert.equal(scheduledDeductionAmount(1000), 1000);
  assert.equal(scheduledDeductionAmount(1000, 800, 0), 800);
  assert.equal(scheduledDeductionAmount(1000, 2500, 1800), 700);
  assert.equal(scheduledDeductionAmount(1000, 2500, 2500), 0);
});

test("PAY-STAT-003: tenant master and employee component controls resolve fail-safe", () => {
  const enabled = { statutoryEnabled: true, sssEnabled: true, philHealthEnabled: true, pagIbigEnabled: true, withholdingTaxEnabled: true };
  assert.deepEqual(resolveStatutoryApplicability(), enabled);
  assert.deepEqual(resolveStatutoryApplicability({ ...enabled, statutoryEnabled: false }, enabled), {
    statutoryEnabled: false,
    sssEnabled: false,
    philHealthEnabled: false,
    pagIbigEnabled: false,
    withholdingTaxEnabled: false,
  });
  assert.deepEqual(resolveStatutoryApplicability(enabled, { ...enabled, philHealthEnabled: false }), { ...enabled, philHealthEnabled: false });
});

test("PAY-STAT-003: disabled components are zero and withholding uses only enabled mandatory contributions", () => {
  const result = calculateStatutoryContributions({
    monthlyBasicSalary: 30000,
    grossPay: 15000,
    payFrequency: "SEMI_MONTHLY",
    rules,
    applicability: { statutoryEnabled: true, sssEnabled: false, philHealthEnabled: true, pagIbigEnabled: false, withholdingTaxEnabled: true },
  });
  assert.equal(result.sssEmployeeContribution, 0);
  assert.equal(result.sssEmployerContribution, 0);
  assert.equal(result.employeeCompensationContribution, 0);
  assert.equal(result.philHealthEmployeeContribution, 375);
  assert.equal(result.pagIbigEmployeeContribution, 0);
  assert.equal(result.taxableCompensation, 14625);
  assert.equal(result.withholdingTax, 631.2);
  assert.equal(result.statutoryDeduction, 1006.2);
});

test("PAY-DED-002 PAY-LOAN-002 PAY-STAT-003: persistence, tenant scope, immutable locks, and employee ownership are wired", () => {
  assert.match(schema, /model PayrollDeductionSchedule/);
  assert.match(schema, /model PayrollStatutoryApplicability/);
  assert.match(schema, /scheduleId\s+String\?/);
  assert.match(migration, /ONE_TIME.*RECURRING.*UNTIL_FULLY_PAID/);
  assert.match(payrollActions, /tenantId: user\.tenantId[\s\S]*payrollDeductionSchedule/);
  assert.match(payrollActions, /status: \{ notIn: \[\.\.\.MUTABLE_PAYROLL_STATUSES\] \}/);
  assert.match(payrollActions, /tenantDefaultId:[\s\S]*employeeOverrideId:[\s\S]*flags: applicability/);
  assert.match(employeeLoans, /tenantId: user\.tenantId, employeeId: user\.employeeProfile\.id/);
});

test("PAY-UX-001: payroll navigation is consolidated into six primary tasks", () => {
  for (const label of ["Overview", "Payroll runs", "Deductions & loans", "Government contributions", "Reports", "Settings"]) {
    assert.match(adminPayroll, new RegExp(`label: \"${label.replace(/[&]/g, "&")}\"`));
  }
  assert.match(adminPayroll, /const steps = \["Setup", "Calculate", "Review", "Approve", "Post", "Pay"\]/);
  assert.doesNotMatch(adminPayroll, /label: "Period management"/);
});

const rules: PhilippineStatutoryRulesV1 = {
  schemaVersion: 1,
  labor: {
    standardHoursPerDay: 8,
    ordinaryOvertimeMultiplier: 1.25,
    nonOrdinaryOvertimeMultiplier: 1.3,
    nightDifferentialRate: 0.1,
    restDayMultiplier: 1.3,
    specialNonWorkingDayMultiplier: 1.3,
    specialNonWorkingRestDayMultiplier: 1.5,
    specialWorkingDayMultiplier: 1,
    regularHolidayMultiplier: 2,
    regularHolidayRestDayMultiplier: 2.6,
    hoaDeclaredHolidayMultiplier: 1,
  },
  sss: {
    monthlySalaryCreditMinimum: 5000,
    monthlySalaryCreditMaximum: 35000,
    monthlySalaryCreditStep: 500,
    employeeRate: 0.05,
    employerRate: 0.1,
    employeeCompensationLow: 10,
    employeeCompensationHigh: 30,
    employeeCompensationThreshold: 14500,
  },
  philHealth: {
    monthlyBasicSalaryFloor: 10000,
    monthlyBasicSalaryCeiling: 100000,
    premiumRate: 0.05,
    employeeShareRate: 0.5,
  },
  pagIbig: {
    monthlyFundSalaryCeiling: 10000,
    employeeRateAtOrBelowThreshold: 0.01,
    employeeRateAboveThreshold: 0.02,
    employeeRateThreshold: 1500,
    employerRate: 0.02,
  },
  withholdingTax: {
    semiMonthly: [
      { over: 0, base: 0, rate: 0 },
      { over: 10417, base: 0, rate: 0.15 },
      { over: 16667, base: 937.5, rate: 0.2 },
    ],
    monthly: [
      { over: 0, base: 0, rate: 0 },
      { over: 20833, base: 0, rate: 0.15 },
      { over: 33333, base: 1875, rate: 0.2 },
    ],
  },
};
