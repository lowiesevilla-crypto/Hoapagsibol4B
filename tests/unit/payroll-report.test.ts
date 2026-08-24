import assert from "node:assert/strict";
import test from "node:test";
import { PayrollStatus } from "@prisma/client";
import { type PayrollReportRow, parsePayrollReportStatus, summarizePayrollReport } from "@/lib/payroll-report";

function row(overrides: Partial<PayrollReportRow> = {}): PayrollReportRow {
  return {
    payrollId: "period-1",
    payslipId: "slip-1",
    employeeId: "employee-1",
    employeeNumber: "EMP-001",
    employeeName: "Employee One",
    position: "Staff",
    salaryType: "MONTHLY",
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-08-15T00:00:00.000Z"),
    payDate: new Date("2026-08-16T00:00:00.000Z"),
    payrollStatus: PayrollStatus.FINALIZED,
    payableDays: 10,
    absentDays: 1,
    overtimeHours: 2,
    basicPay: 10000,
    overtimePay: 500.125,
    allowance: 1000,
    deduction: 750.555,
    grossPay: 11500.125,
    netPay: 10749.57,
    ...overrides,
  };
}

test("PAY-RPT-001: report totals are deterministic and count unique periods/employees", () => {
  const rows = [
    row(),
    row({ payrollId: "period-2", payslipId: "slip-2", overtimeHours: 1.25, basicPay: 12000, overtimePay: 250.125, allowance: 500, deduction: 1000.445, grossPay: 12750.125, netPay: 11749.68 }),
    row({ payrollId: "period-2", payslipId: "slip-3", employeeId: "employee-2", employeeNumber: "EMP-002", employeeName: "Employee Two", payableDays: 9.5, absentDays: 0.5, overtimeHours: 0, basicPay: 9000, overtimePay: 0, allowance: 250, deduction: 500, grossPay: 9250, netPay: 8750 }),
  ];

  const totals = summarizePayrollReport(rows.map((item) => item.payrollId), rows);
  assert.equal(totals.periods, 2);
  assert.equal(totals.employees, 2);
  assert.equal(totals.payslips, 3);
  assert.equal(totals.payableDays, 29.5);
  assert.equal(totals.absentDays, 2.5);
  assert.equal(totals.overtimeHours, 3.25);
  assert.equal(totals.basicPay, 31000);
  assert.equal(totals.overtimePay, 750.25);
  assert.equal(totals.allowance, 1750);
  assert.equal(totals.deduction, 2251);
  assert.equal(totals.grossPay, 33500.25);
  assert.equal(totals.netPay, 31249.25);
});

test("PAY-RPT-001: status parsing accepts only supported payroll lifecycle values", () => {
  assert.equal(parsePayrollReportStatus("DRAFT"), PayrollStatus.DRAFT);
  assert.equal(parsePayrollReportStatus("FINALIZED"), PayrollStatus.FINALIZED);
  assert.equal(parsePayrollReportStatus("PAID"), PayrollStatus.PAID);
  assert.equal(parsePayrollReportStatus("ALL"), "ALL");
  assert.equal(parsePayrollReportStatus("POSTED"), "ALL");
  assert.equal(parsePayrollReportStatus(undefined), "ALL");
});
