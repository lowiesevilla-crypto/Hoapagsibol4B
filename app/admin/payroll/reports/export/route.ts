import { requirePayrollAccess } from "@/lib/payroll-access";
import { getPayrollReport, parsePayrollReportStatus } from "@/lib/services/payroll-report";

/**
 * @requirement PAY-RPT-001 PAY-SEC-001
 * @status IMPLEMENTED
 * @description Exports the same tenant-scoped payroll rows and totals shown by the payroll report page.
 */
export async function GET(request: Request) {
  const { user } = await requirePayrollAccess();
  const url = new URL(request.url);
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const fromText = validDateInput(url.searchParams.get("from")) ? url.searchParams.get("from")! : isoDate(defaultFrom);
  const toText = validDateInput(url.searchParams.get("to")) ? url.searchParams.get("to")! : isoDate(now);
  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  const status = parsePayrollReportStatus(url.searchParams.get("status"));
  const report = await getPayrollReport({ tenantId: user.tenantId, from, to, status });

  const header = [
    "Payroll ID", "Payslip ID", "Employee No.", "Employee", "Position", "Salary Type",
    "Period Start", "Period End", "Pay Date", "Status", "Payable Days", "Absent Days",
    "OT Hours", "Basic Pay", "OT Pay", "Allowance", "Deduction", "Gross Pay", "Net Pay",
  ];
  const rows: unknown[][] = [
    header,
    ...report.rows.map((row) => [
      row.payrollId,
      row.payslipId,
      row.employeeNumber,
      row.employeeName,
      row.position,
      row.salaryType,
      isoDate(row.periodStart),
      isoDate(row.periodEnd),
      isoDate(row.payDate),
      row.payrollStatus,
      row.payableDays,
      row.absentDays,
      row.overtimeHours,
      row.basicPay,
      row.overtimePay,
      row.allowance,
      row.deduction,
      row.grossPay,
      row.netPay,
    ]),
    ["TOTAL", "", "", "", "", "", "", "", "", "", report.totals.payableDays, report.totals.absentDays, report.totals.overtimeHours, report.totals.basicPay, report.totals.overtimePay, report.totals.allowance, report.totals.deduction, report.totals.grossPay, report.totals.netPay],
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const statusName = status.toLowerCase();
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-report-${fromText}-to-${toText}-${statusName}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function validDateInput(value: string | null) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
