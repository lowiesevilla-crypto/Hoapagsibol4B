import "server-only";

import { PayrollStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

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
 * @requirement PAY-RPT-001 PAY-SEC-001
 * @status IMPLEMENTED
 * @description Loads payroll report rows only for the authenticated tenant and requested payout-date range.
 */
export async function getPayrollReport(input: {
  tenantId: string;
  from: Date;
  to: Date;
  status?: PayrollReportStatusFilter;
}): Promise<PayrollReport> {
  if (!input.tenantId) throw new Error("Tenant scope is required for payroll reporting.");
  if (input.from > input.to) throw new Error("Report start date must be on or before the end date.");

  const status = input.status ?? "ALL";
  const periods = await prisma.payrollPeriod.findMany({
    where: {
      tenantId: input.tenantId,
      payDate: { gte: input.from, lte: input.to },
      ...(status === "ALL" ? {} : { status }),
    },
    include: {
      payslips: {
        where: { tenantId: input.tenantId },
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              name: true,
              position: true,
              salaryType: true,
            },
          },
        },
        orderBy: { employee: { name: "asc" } },
      },
    },
    orderBy: [{ payDate: "desc" }, { startDate: "desc" }],
  });

  const rows: PayrollReportRow[] = periods.flatMap((period) => period.payslips.map((slip) => ({
    payrollId: period.id,
    payslipId: slip.id,
    employeeId: slip.employeeId,
    employeeNumber: slip.employee.employeeNumber,
    employeeName: slip.employee.name,
    position: slip.employee.position,
    salaryType: slip.employee.salaryType,
    periodStart: period.startDate,
    periodEnd: period.endDate,
    payDate: period.payDate,
    payrollStatus: period.status,
    payableDays: Number(slip.payableDays),
    absentDays: Number(slip.absentDays),
    overtimeHours: Number(slip.overtimeHours),
    basicPay: Number(slip.basicPay),
    overtimePay: Number(slip.overtimePay),
    allowance: Number(slip.allowance),
    deduction: Number(slip.deduction),
    grossPay: Number(slip.grossPay),
    netPay: Number(slip.netPay),
  })));

  return {
    from: input.from,
    to: input.to,
    status,
    rows,
    totals: summarizePayrollReport(periods.map((period) => period.id), rows),
  };
}

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
  if (value === PayrollStatus.DRAFT || value === PayrollStatus.FINALIZED || value === PayrollStatus.PAID) return value;
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
