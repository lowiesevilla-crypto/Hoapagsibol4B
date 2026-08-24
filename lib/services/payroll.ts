import type { Attendance, PayrollDeduction } from "@prisma/client";

type DecimalLike = number | string | { toString(): string };

export type CompensationBasisValue = "MONTHLY" | "DAILY" | "HOURLY" | "FIXED_PER_PERIOD";
export type PayFrequencyValue = "SEMI_MONTHLY" | "MONTHLY";
export type AttendancePolicyValue = "REQUIRED" | "EXCEPTION_ONLY" | "NOT_REQUIRED";

export type PayrollCalculationPolicy = Readonly<{
  key: string;
  standardHoursPerDay: number;
  overtimeMultiplier: number;
  ordinaryOvertimeMultiplier: number;
  nonOrdinaryOvertimeMultiplier: number;
  nightDifferentialRate: number;
  restDayPremiumRate: number;
  holidayPremiumRate: number;
  restDayMultiplier: number;
  specialNonWorkingDayMultiplier: number;
  specialNonWorkingRestDayMultiplier: number;
  specialWorkingDayMultiplier: number;
  regularHolidayMultiplier: number;
  regularHolidayRestDayMultiplier: number;
  hoaDeclaredHolidayMultiplier: number;
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
  ordinaryOvertimeMultiplier: 1.25,
  nonOrdinaryOvertimeMultiplier: 1.3,
  nightDifferentialRate: 0.1,
  restDayPremiumRate: 0.3,
  holidayPremiumRate: 0.3,
  restDayMultiplier: 1.3,
  specialNonWorkingDayMultiplier: 1.3,
  specialNonWorkingRestDayMultiplier: 1.3,
  specialWorkingDayMultiplier: 1.3,
  regularHolidayMultiplier: 1.3,
  regularHolidayRestDayMultiplier: 1.3,
  hoaDeclaredHolidayMultiplier: 1.3,
});

type ApprovedOvertime = {
  hours: DecimalLike;
  source: "APPROVED_REQUEST" | "PAYROLL_MANAGER_ADJUSTMENT";
  isRestDay?: boolean;
  holidayType?: PayrollAttendanceSnapshot["holidayType"];
};

export type PayrollEmployeeSnapshot = {
  salaryType?: "DAILY" | "MONTHLY";
  baseRate?: DecimalLike;
  compensationBasis?: CompensationBasisValue;
  payFrequency?: PayFrequencyValue;
  attendancePolicy?: AttendancePolicyValue;
  rate?: DecimalLike;
  standardWorkDays: number;
  standardHoursPerDay?: DecimalLike;
  fixedAllowance: DecimalLike;
  fixedDeduction: DecimalLike;
};

type PayrollAttendanceSnapshot = Pick<
  Attendance,
  "status" | "lateMinutes" | "undertimeMinutes" | "nightDifferentialHours" | "isRestDay" | "holidayType"
> & Partial<Pick<Attendance, "totalHours">>;

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
    ["ordinaryOvertimeMultiplier", policy.ordinaryOvertimeMultiplier],
    ["nonOrdinaryOvertimeMultiplier", policy.nonOrdinaryOvertimeMultiplier],
    ["nightDifferentialRate", policy.nightDifferentialRate],
    ["restDayPremiumRate", policy.restDayPremiumRate],
    ["holidayPremiumRate", policy.holidayPremiumRate],
    ["restDayMultiplier", policy.restDayMultiplier],
    ["specialNonWorkingDayMultiplier", policy.specialNonWorkingDayMultiplier],
    ["specialNonWorkingRestDayMultiplier", policy.specialNonWorkingRestDayMultiplier],
    ["specialWorkingDayMultiplier", policy.specialWorkingDayMultiplier],
    ["regularHolidayMultiplier", policy.regularHolidayMultiplier],
    ["regularHolidayRestDayMultiplier", policy.regularHolidayRestDayMultiplier],
    ["hoaDeclaredHolidayMultiplier", policy.hoaDeclaredHolidayMultiplier],
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
 * @requirement PAY-COMP-001 PAY-COMP-002 PAY-CALC-001
 * @status IMPLEMENTED
 * @description Resolve independent compensation basis, pay frequency and attendance policy while preserving the legacy calculation path for pre-migration snapshots.
 */
function resolveEmployeeCompensation(employee: PayrollEmployeeSnapshot, policy: PayrollCalculationPolicy) {
  const legacy = !employee.compensationBasis;
  const compensationBasis: CompensationBasisValue = employee.compensationBasis
    ?? (employee.salaryType === "DAILY" ? "DAILY" : "MONTHLY");
  const payFrequency: PayFrequencyValue = employee.payFrequency ?? "SEMI_MONTHLY";
  const attendancePolicy: AttendancePolicyValue = employee.attendancePolicy ?? "REQUIRED";
  const rate = Number(employee.rate ?? employee.baseRate);
  const standardWorkDays = Number(employee.standardWorkDays);
  const standardHoursPerDay = Number(employee.standardHoursPerDay ?? policy.standardHoursPerDay);

  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Employee compensation rate must be greater than zero.");
  if (!Number.isFinite(standardWorkDays) || standardWorkDays <= 0) throw new Error("Employee standard work days must be greater than zero.");
  if (!Number.isFinite(standardHoursPerDay) || standardHoursPerDay <= 0 || standardHoursPerDay > 24) {
    throw new Error("Employee standard hours per day must be greater than zero and no more than 24.");
  }
  if (!legacy && attendancePolicy !== "REQUIRED" && ["DAILY", "HOURLY"].includes(compensationBasis)) {
    throw new Error("Daily and hourly compensation require attendance-based payroll.");
  }

  const payPeriodsPerMonth = payFrequency === "SEMI_MONTHLY" ? 2 : 1;
  const expectedWorkDaysPerPeriod = standardWorkDays / payPeriodsPerMonth;
  const periodBase = compensationBasis === "MONTHLY"
    ? rate / payPeriodsPerMonth
    : compensationBasis === "FIXED_PER_PERIOD"
      ? rate
      : 0;
  const dailyRate = compensationBasis === "MONTHLY"
    ? rate / standardWorkDays
    : compensationBasis === "DAILY"
      ? rate
      : compensationBasis === "HOURLY"
        ? rate * standardHoursPerDay
        : rate / expectedWorkDaysPerPeriod;
  const hourlyRate = compensationBasis === "HOURLY" ? rate : dailyRate / standardHoursPerDay;

  return {
    legacy,
    compensationBasis,
    payFrequency,
    attendancePolicy,
    rate,
    standardWorkDays,
    standardHoursPerDay,
    expectedWorkDaysPerPeriod,
    periodBase,
    dailyRate,
    hourlyRate,
  };
}

/**
 * @requirement PAY-CALC-001 PAY-CALC-002 PAY-CALC-003 PAY-ATT-001 PAY-OT-001 PAY-COMP-001 PAY-COMP-002
 * @status IMPLEMENTED
 * @description Deterministically calculate a payslip from explicit effective-dated employee, attendance, deduction, overtime, and policy snapshots.
 */
export function calculatePayslipWithPolicy(
  employee: PayrollEmployeeSnapshot,
  records: PayrollAttendanceSnapshot[],
  assignedDeductions: Pick<PayrollDeduction, "amount">[] = [],
  approvedOvertime: ApprovedOvertime[] = [],
  calculationPolicy: PayrollCalculationPolicy,
) {
  const policy = validatePayrollCalculationPolicy(calculationPolicy);
  const compensation = resolveEmployeeCompensation(employee, policy);
  let payableDays = 0;
  let absentDays = 0;
  let lateAndUndertimeHours = 0;
  let nightDifferentialPayBeforeRounding = 0;
  let dayPremiumPayBeforeRounding = 0;
  let trackedRegularHours = 0;
  let hasTrackedHours = false;

  for (const record of records) {
    if (["PRESENT", "PAID_LEAVE", "HOLIDAY"].includes(record.status)) payableDays += 1;
    else if (record.status === "HALF_DAY") payableDays += 0.5;
    else if (["ABSENT", "UNPAID_LEAVE"].includes(record.status)) absentDays += 1;

    lateAndUndertimeHours += (Number(record.lateMinutes ?? 0) + Number(record.undertimeMinutes ?? 0)) / 60;
    const workedFraction = record.status === "HALF_DAY" ? 0.5 : record.status === "PRESENT" ? 1 : 0;
    const multiplier = payrollDayMultiplier(record, policy);
    dayPremiumPayBeforeRounding += compensation.dailyRate * Math.max(0, multiplier - 1) * workedFraction;
    nightDifferentialPayBeforeRounding += compensation.hourlyRate
      * multiplier
      * policy.nightDifferentialRate
      * Number(record.nightDifferentialHours ?? 0);

    if (record.totalHours != null) {
      hasTrackedHours = true;
      trackedRegularHours += Math.min(Math.max(0, Number(record.totalHours)), compensation.standardHoursPerDay);
    }

  }

  const overtimeHours = approvedOvertime.reduce((sum, item) => sum + Number(item.hours), 0);
  const overtimeSource = approvedOvertime.some((item) => item.source === "PAYROLL_MANAGER_ADJUSTMENT")
    ? "Payroll Manager Adjustment"
    : approvedOvertime.length
      ? "Approved OT Request"
      : "None";

  let basicPayBeforeRounding: number;
  if (compensation.legacy) {
    basicPayBeforeRounding = compensation.dailyRate * payableDays - compensation.hourlyRate * lateAndUndertimeHours;
  } else if (compensation.attendancePolicy === "NOT_REQUIRED") {
    basicPayBeforeRounding = compensation.periodBase;
  } else if (compensation.attendancePolicy === "EXCEPTION_ONLY") {
    basicPayBeforeRounding = compensation.periodBase
      - compensation.dailyRate * absentDays
      - compensation.hourlyRate * lateAndUndertimeHours;
  } else if (compensation.compensationBasis === "HOURLY") {
    const regularHours = hasTrackedHours
      ? trackedRegularHours
      : Math.max(0, payableDays * compensation.standardHoursPerDay - lateAndUndertimeHours);
    basicPayBeforeRounding = compensation.hourlyRate * regularHours;
  } else if (compensation.compensationBasis === "FIXED_PER_PERIOD") {
    const attendanceRatio = compensation.expectedWorkDaysPerPeriod > 0
      ? Math.min(1, payableDays / compensation.expectedWorkDaysPerPeriod)
      : 0;
    basicPayBeforeRounding = compensation.periodBase * attendanceRatio
      - compensation.hourlyRate * lateAndUndertimeHours;
  } else {
    basicPayBeforeRounding = compensation.dailyRate * payableDays
      - compensation.hourlyRate * lateAndUndertimeHours;
  }

  const basicPay = roundMoney(Math.max(0, basicPayBeforeRounding));
  const overtimePay = roundMoney(
    approvedOvertime.reduce((sum, item) => {
      const multiplier = payrollDayMultiplier(item, policy);
      const overtimeMultiplier = multiplier === 1
        ? policy.ordinaryOvertimeMultiplier
        : policy.nonOrdinaryOvertimeMultiplier;
      return sum + compensation.hourlyRate * multiplier * overtimeMultiplier * Number(item.hours);
    }, 0)
    + nightDifferentialPayBeforeRounding
    + dayPremiumPayBeforeRounding,
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

function payrollDayMultiplier(
  record: { isRestDay?: boolean; holidayType?: PayrollAttendanceSnapshot["holidayType"] },
  policy: PayrollCalculationPolicy,
) {
  if (record.holidayType === "REGULAR_HOLIDAY") {
    return record.isRestDay ? policy.regularHolidayRestDayMultiplier : policy.regularHolidayMultiplier;
  }
  if (record.holidayType === "SPECIAL_NON_WORKING_HOLIDAY") {
    return record.isRestDay ? policy.specialNonWorkingRestDayMultiplier : policy.specialNonWorkingDayMultiplier;
  }
  if (record.holidayType === "SPECIAL_WORKING_HOLIDAY") return policy.specialWorkingDayMultiplier;
  if (record.holidayType === "HOA_DECLARED_HOLIDAY") return policy.hoaDeclaredHolidayMultiplier;
  return record.isRestDay ? policy.restDayMultiplier : 1;
}

/**
 * @requirement PAY-CALC-001 PAY-CALC-002 PAY-COMP-001
 * @status IMPLEMENTED
 * @description Backward-compatible entry point. Effective-dated compensation snapshots use the independent compensation fields; legacy callers continue through the named compatibility policy.
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
