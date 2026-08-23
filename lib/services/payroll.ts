import type { Attendance, EmployeeProfile, PayrollDeduction } from "@prisma/client";

export type PayrollCalculationPolicy = Readonly<{
  key: string;
  standardHoursPerDay: number;
  overtimeMultiplier: number;
  nightDifferentialRate: number;
  restDayPremiumRate: number;
  holidayPremiumRate: number;
}>;

/**
 * Compatibility-only policy that preserves the payroll calculation behavior that
 * existed before the effective-dated payroll rules initiative.
 *
 * IMPORTANT: these values are NOT asserted to be the current Philippine
 * statutory rates. PAY-STAT-001 remains BLOCKED until authoritative rule tables
 * and effective dates are verified and persisted.
 */
export const LEGACY_COMPATIBILITY_POLICY: PayrollCalculationPolicy = Object.freeze({
  key: "LEGACY_COMPATIBILITY_V1",
  standardHoursPerDay: 8,
  overtimeMultiplier: 1.25,
  nightDifferentialRate: 0.1,
  restDayPremiumRate: 0.3,
  holidayPremiumRate: 0.3,
});

type ApprovedOvertime = {
  hours: number | string | { toString(): string };
  source: "APPROVED_REQUEST" | "PAYROLL_MANAGER_ADJUSTMENT";
};

type PayrollEmployeeSnapshot = Pick<EmployeeProfile, "salaryType" | "baseRate" | "standardWorkDays" | "fixedAllowance" | "fixedDeduction">;
type PayrollAttendanceSnapshot = Pick<
  Attendance,
  "status" | "lateMinutes" | "undertimeMinutes" | "nightDifferentialHours" | "isRestDay" | "holidayType"
>;

/**
 * @requirement PAY-CALC-003
 * @status IMPLEMENTED
 * @description Round currency consistently to two decimal places.
 */
function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * @requirement PAY-CALC-002
 * @status IMPLEMENTED
 * @description Reject malformed calculation policy values before payroll math executes.
 */
export function validatePayrollCalculationPolicy(policy: PayrollCalculationPolicy) {
  const numericFields: Array<[keyof PayrollCalculationPolicy, number]> = [
    ["standardHoursPerDay", policy.standardHoursPerDay],
    ["overtimeMultiplier", policy.overtimeMultiplier],
    ["nightDifferentialRate", policy.nightDifferentialRate],
    ["restDayPremiumRate", policy.restDayPremiumRate],
    ["holidayPremiumRate", policy.holidayPremiumRate],
  ];

  if (!policy.key.trim()) throw new Error("Payroll calculation policy key is required.");

  for (const [name, value] of numericFields) {
    if (!Number.isFinite(value)) throw new Error(`Payroll calculation policy ${String(name)} must be a finite number.`);
  }
  if (policy.standardHoursPerDay <= 0 || policy.standardHoursPerDay > 24) {
    throw new Error("Payroll calculation policy standardHoursPerDay must be greater than zero and no more than 24.");
  }
  if (policy.overtimeMultiplier < 0 || policy.nightDifferentialRate < 0 || policy.restDayPremiumRate < 0 || policy.holidayPremiumRate < 0) {
    throw new Error("Payroll calculation policy multipliers and premium rates cannot be negative.");
  }

  return policy;
}

/**
 * @requirement PAY-CALC-001 PAY-CALC-002 PAY-CALC-003 PAY-ATT-001 PAY-OT-001
 * @status IMPLEMENTED
 * @description Deterministically calculate a payslip from explicit employee, attendance, deduction, overtime, and policy snapshots.
 */
export function calculatePayslipWithPolicy(
  employee: PayrollEmployeeSnapshot,
  records: PayrollAttendanceSnapshot[],
  assignedDeductions: Pick<PayrollDeduction, "amount">[] = [],
  approvedOvertime: ApprovedOvertime[] = [],
  calculationPolicy: PayrollCalculationPolicy,
) {
  const policy = validatePayrollCalculationPolicy(calculationPolicy);
  let payableDays = 0;
  let absentDays = 0;
  let lateAndUndertimeHours = 0;
  let nightDifferentialHours = 0;
  let holidayPremiumDays = 0;
  let restDayPremiumDays = 0;

  for (const record of records) {
    if (["PRESENT", "PAID_LEAVE", "HOLIDAY"].includes(record.status)) payableDays += 1;
    else if (record.status === "HALF_DAY") payableDays += 0.5;
    else if (["ABSENT", "UNPAID_LEAVE"].includes(record.status)) absentDays += 1;

    lateAndUndertimeHours += (Number(record.lateMinutes ?? 0) + Number(record.undertimeMinutes ?? 0)) / 60;
    nightDifferentialHours += Number(record.nightDifferentialHours ?? 0);

    if (record.isRestDay && ["PRESENT", "HALF_DAY", "HOLIDAY"].includes(record.status)) {
      restDayPremiumDays += record.status === "HALF_DAY" ? 0.5 : 1;
    }
    if (
      ["REGULAR_HOLIDAY", "SPECIAL_NON_WORKING_HOLIDAY", "SPECIAL_WORKING_HOLIDAY", "HOA_DECLARED_HOLIDAY"].includes(String(record.holidayType ?? ""))
      && ["PRESENT", "HALF_DAY", "HOLIDAY"].includes(record.status)
    ) {
      holidayPremiumDays += record.status === "HALF_DAY" ? 0.5 : 1;
    }
  }

  const overtimeHours = approvedOvertime.reduce((sum, item) => sum + Number(item.hours), 0);
  const overtimeSource = approvedOvertime.some((item) => item.source === "PAYROLL_MANAGER_ADJUSTMENT")
    ? "Payroll Manager Adjustment"
    : approvedOvertime.length
      ? "Approved OT Request"
      : "None";

  const standardWorkDays = Number(employee.standardWorkDays);
  if (!Number.isFinite(standardWorkDays) || standardWorkDays <= 0) {
    throw new Error("Employee standard work days must be greater than zero.");
  }

  const dailyRate = employee.salaryType === "MONTHLY"
    ? Number(employee.baseRate) / standardWorkDays
    : Number(employee.baseRate);
  const hourlyRate = dailyRate / policy.standardHoursPerDay;
  const basicPay = roundMoney(Math.max(0, dailyRate * payableDays - hourlyRate * lateAndUndertimeHours));
  const overtimePay = roundMoney(
    (hourlyRate * policy.overtimeMultiplier * overtimeHours)
    + (hourlyRate * policy.nightDifferentialRate * nightDifferentialHours)
    + (dailyRate * policy.restDayPremiumRate * restDayPremiumDays)
    + (dailyRate * policy.holidayPremiumRate * holidayPremiumDays),
  );
  const allowance = roundMoney(Number(employee.fixedAllowance));
  const employeeSpecificDeductions = assignedDeductions.reduce((sum, item) => sum + Number(item.amount), 0);
  const deduction = roundMoney(Number(employee.fixedDeduction) + employeeSpecificDeductions);
  const grossPay = roundMoney(basicPay + overtimePay + allowance);
  const netPay = roundMoney(Math.max(0, grossPay - deduction));

  return {
    payableDays,
    absentDays,
    overtimeHours,
    overtimeSource,
    basicPay,
    overtimePay,
    allowance,
    deduction,
    grossPay,
    netPay,
  };
}

/**
 * @requirement PAY-CALC-001 PAY-CALC-002
 * @status DEFERRED
 * @description Backward-compatible wrapper. Replace its legacy default with an effective-dated persisted policy resolver under PAY-STAT-001/PAY-COMP-002.
 */
export function calculatePayslip(
  employee: PayrollEmployeeSnapshot,
  records: PayrollAttendanceSnapshot[],
  assignedDeductions: Pick<PayrollDeduction, "amount">[] = [],
  approvedOvertime: ApprovedOvertime[] = [],
  calculationPolicy: PayrollCalculationPolicy = LEGACY_COMPATIBILITY_POLICY,
) {
  return calculatePayslipWithPolicy(employee, records, assignedDeductions, approvedOvertime, calculationPolicy);
}
