import "server-only";

import { prisma } from "@/lib/db";
import {
  type PayrollReport,
  type PayrollReportRow,
  type PayrollReportStatusFilter,
  parsePayrollReportStatus,
  summarizePayrollReport,
} from "@/lib/payroll-report";

export { parsePayrollReportStatus, summarizePayrollReport } from "@/lib/payroll-report";
export type { PayrollReport, PayrollReportRow, PayrollReportStatusFilter, PayrollReportTotals } from "@/lib/payroll-report";

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

  const status = parsePayrollReportStatus(input.status);
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
