import type { Attendance, EmployeeProfile, PayrollDeduction } from "@prisma/client";

function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }

type ApprovedOvertime = { hours: number | string | { toString(): string }; source: "APPROVED_REQUEST" | "PAYROLL_MANAGER_ADJUSTMENT" };

export function calculatePayslip(
  employee: EmployeeProfile,
  records: Attendance[],
  assignedDeductions: Pick<PayrollDeduction, "amount">[] = [],
  approvedOvertime: ApprovedOvertime[] = [],
) {
  let payableDays = 0;
  let absentDays = 0;
  let overtimeHours = 0;
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
    if (record.isRestDay && ["PRESENT", "HALF_DAY", "HOLIDAY"].includes(record.status)) restDayPremiumDays += record.status === "HALF_DAY" ? 0.5 : 1;
    if (["REGULAR_HOLIDAY", "SPECIAL_NON_WORKING_HOLIDAY", "SPECIAL_WORKING_HOLIDAY", "HOA_DECLARED_HOLIDAY"].includes(String(record.holidayType ?? "")) && ["PRESENT", "HALF_DAY", "HOLIDAY"].includes(record.status)) holidayPremiumDays += record.status === "HALF_DAY" ? 0.5 : 1;
  }
  overtimeHours = approvedOvertime.reduce((sum, item) => sum + Number(item.hours), 0);
  const overtimeSource = approvedOvertime.some((item) => item.source === "PAYROLL_MANAGER_ADJUSTMENT")
    ? "Payroll Manager Adjustment"
    : approvedOvertime.length
      ? "Approved OT Request"
      : "None";
  const dailyRate = employee.salaryType === "MONTHLY" ? Number(employee.baseRate) / employee.standardWorkDays : Number(employee.baseRate);
  const hourlyRate = dailyRate / 8;
  const basicPay = roundMoney(Math.max(0, dailyRate * payableDays - hourlyRate * lateAndUndertimeHours));
  const overtimePay = roundMoney((hourlyRate * 1.25 * overtimeHours) + (hourlyRate * 0.1 * nightDifferentialHours) + (dailyRate * 0.3 * restDayPremiumDays) + (dailyRate * 0.3 * holidayPremiumDays));
  const allowance = Number(employee.fixedAllowance);
  const employeeSpecificDeductions = assignedDeductions.reduce((sum, item) => sum + Number(item.amount), 0);
  const deduction = roundMoney(Number(employee.fixedDeduction) + employeeSpecificDeductions);
  const grossPay = roundMoney(basicPay + overtimePay + allowance);
  const netPay = roundMoney(Math.max(0, grossPay - deduction));
  return { payableDays, absentDays, overtimeHours, overtimeSource, basicPay, overtimePay, allowance, deduction, grossPay, netPay };
}
