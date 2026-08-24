import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { calculatePayslipWithPolicy, type PayrollCalculationPolicy } from "../../lib/services/payroll";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260824130000_payroll_effective_compensation/migration.sql"), "utf8");
const employeeActions = readFileSync(resolve(process.cwd(), "lib/actions/employees.ts"), "utf8");
const payrollActions = readFileSync(resolve(process.cwd(), "lib/actions/payroll.ts"), "utf8");
const employeeForm = readFileSync(resolve(process.cwd(), "components/employee-form.tsx"), "utf8");

const policy: PayrollCalculationPolicy = {
  key: "PAY_COMP_TEST",
  standardHoursPerDay: 8,
  overtimeMultiplier: 1.25,
  nightDifferentialRate: 0.1,
  restDayPremiumRate: 0.3,
  holidayPremiumRate: 0.3,
};

function configured(overrides: Record<string, unknown> = {}) {
  return {
    compensationBasis: "MONTHLY" as const,
    payFrequency: "SEMI_MONTHLY" as const,
    attendancePolicy: "NOT_REQUIRED" as const,
    rate: 26000,
    standardWorkDays: 26,
    standardHoursPerDay: 8,
    fixedAllowance: 0,
    fixedDeduction: 0,
    ...overrides,
  };
}

test("PAY-COMP-001: monthly no-clock compensation is independent from attendance and honors semi-monthly frequency", () => {
  const result = calculatePayslipWithPolicy(configured(), [], [], [], policy);
  assert.equal(result.basicPay, 13000);
  assert.equal(result.netPay, 13000);
});

test("PAY-COMP-001: exception-only monthly compensation deducts explicit absence without requiring positive punches", () => {
  const result = calculatePayslipWithPolicy(
    configured({ attendancePolicy: "EXCEPTION_ONLY" }),
    [{ status: "ABSENT", lateMinutes: 0, undertimeMinutes: 0, nightDifferentialHours: 0 as never, isRestDay: false, holidayType: null }],
    [],
    [],
    policy,
  );
  assert.equal(result.basicPay, 12000);
});

test("PAY-COMP-001: fixed-per-period no-clock compensation pays the configured period rate", () => {
  const result = calculatePayslipWithPolicy(
    configured({ compensationBasis: "FIXED_PER_PERIOD", rate: 10000 }),
    [], [], [], policy,
  );
  assert.equal(result.basicPay, 10000);
});

test("PAY-COMP-001: daily and hourly compensation reject non-attendance policies", () => {
  assert.throws(
    () => calculatePayslipWithPolicy(configured({ compensationBasis: "DAILY", attendancePolicy: "NOT_REQUIRED", rate: 1000 }), [], [], [], policy),
    /require attendance-based payroll/i,
  );
});

test("PAY-COMP-002/PAY-COMP-003: persistence model, backfill, versioning and payslip snapshots exist", () => {
  assert.match(schema, /enum CompensationBasis/);
  assert.match(schema, /enum PayFrequency/);
  assert.match(schema, /enum AttendancePolicy/);
  assert.match(schema, /model EmployeeCompensation/);
  assert.match(schema, /compensationSnapshot\s+Json\?/);
  assert.match(migration, /INSERT INTO `EmployeeCompensation`/);
  assert.match(migration, /CONCAT\('legacy_', `id`\)/);
  assert.match(employeeActions, /persistEmployeeCompensationVersion/);
  assert.match(employeeActions, /PayrollStatus\.FINALIZED/);
  assert.match(employeeActions, /effectiveTo: previousUtcDate/);
  assert.match(payrollActions, /resolvedForDate: period\.endDate\.toISOString\(\)/);
  assert.match(payrollActions, /compensationSnapshot/);
  assert.match(employeeForm, /name="payFrequency"/);
  assert.match(employeeForm, /name="attendancePolicy"/);
});
