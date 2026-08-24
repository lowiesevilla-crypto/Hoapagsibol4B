import { PayrollStatus } from "@prisma/client";

export type PayrollReportStatusFilter = "ALL" | PayrollStatus;

export type PayrollReportRow = {
  payrollId: string;
  payslipId: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  position: string;
  salaryType: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  payrollStatus: PayrollStatus;
  payableDays: number;
  absentDays: number;
  overtimeHours: number;
  basicPay: number;
  overtimePay: number;
  allowance: number;
  deduction: number;
  grossPay: number;
  netPay: number;
};

export type PayrollReportTotals = {
  periods: number;
  employees: number;
  payslips: number;
  payableDays: number;
  absentDays: number;
  overtimeHours: number;
  basicPay: number;
  overtimePay: number;
  allowance: number;
  deduction: number;
  grossPay: number;
  netPay: number;
};

export type PayrollReport = {
  from: Date;
  to: Date;
  status: PayrollReportStatusFilter;
  rows: PayrollReportRow[];
  totals: PayrollReportTotals;
};

/**
 * @requirement PAY-RPT-001
 * @status IMPLEMENTED
 * @description Produces deterministic report totals from the same rows used by HTML and CSV outputs.
 */
export function summarizePayrollReport(periodIds: string[], rows: PayrollReportRow[]): PayrollReportTotals {
  const employees = new Set(rows.map((row) => row.employeeId));
  const periods = new Set(periodIds);
  return rows.reduce<PayrollReportTotals>((totals, row) => ({
    ...totals,
    payableDays: roundReportNumber(totals.payableDays + row.payableDays),
    absentDays: roundReportNumber(totals.absentDays + row.absentDays),
    overtimeHours: roundReportNumber(totals.overtimeHours + row.overtimeHours),
    basicPay: roundMoney(totals.basicPay + row.basicPay),
    overtimePay: roundMoney(totals.overtimePay + row.overtimePay),
    allowance: roundMoney(totals.allowance + row.allowance),
    deduction: roundMoney(totals.deduction + row.deduction),
    grossPay: roundMoney(totals.grossPay + row.grossPay),
    netPay: roundMoney(totals.netPay + row.netPay),
  }), {
    periods: periods.size,
    employees: employees.size,
    payslips: rows.length,
    payableDays: 0,
    absentDays: 0,
    overtimeHours: 0,
    basicPay: 0,
    overtimePay: 0,
    allowance: 0,
    deduction: 0,
    grossPay: 0,
    netPay: 0,
  });
}

/**
 * @requirement PAY-RPT-001
 * @status IMPLEMENTED
 */
export function parsePayrollReportStatus(value: string | null | undefined): PayrollReportStatusFilter {
  if (Object.values(PayrollStatus).includes(value as PayrollStatus)) return value as PayrollStatus;
  return "ALL";
}

/**
 * @requirement PAY-RPT-001
 * @status IMPLEMENTED
 */
function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * @requirement PAY-RPT-001
 * @status IMPLEMENTED
 */
function roundReportNumber(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
