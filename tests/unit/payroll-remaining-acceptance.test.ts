import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const agent = read("Agent.md");
const schema = read("prisma/schema.prisma");
const payrollActions = read("lib/actions/payroll.ts");
const attendanceActions = read("lib/actions/attendance.ts");
const employeePayrollActions = read("lib/actions/employee-payroll.ts");
const payrollService = read("lib/services/payroll.ts");
const financeService = read("lib/services/payroll-finance.ts");
const employeePayslips = read("app/employee/payslips/page.tsx");
const employeePayslip = read("app/employee/payslips/[id]/page.tsx");
const employeePayslipPdf = read("app/employee/payslips/[id]/pdf/route.ts");
const employeeLoans = read("app/employee/loans/page.tsx");

test("PAY-REQ-002: Agent operating contract names the registry, completion semantics, tenant scope, and deferred-scope rule", () => {
  assert.match(agent, /docs\/payroll\/PAYROLL_IMPLEMENTATION_STATUS\.json/);
  assert.match(agent, /Only `VERIFIED` means the requirement is complete/);
  assert.match(agent, /Payroll records created by Server Actions must explicitly carry the authenticated tenant ID/);
  assert.match(agent, /Never report deferred functionality as live/);
});

test("PAY-SEC-002: payroll administration and employee self-service retain separate server-authoritative guards", () => {
  assert.match(payrollActions, /requirePayrollAccess\(payrollManageRoles\)/);
  assert.match(payrollActions, /requirePayrollAccess\(payrollApprovalRoles\)/);
  assert.match(payrollActions, /requirePayrollAccess\(payrollWriteRoles\)/);
  assert.match(employeePayrollActions, /requireUser\(Role\.EMPLOYEE\)/);
  assert.doesNotMatch(employeePayrollActions, /PayrollStatus\.FINALIZED[\s\S]*data: \{ status: PayrollStatus\.PAID/);
});

test("PAY-SHIFT-001: schedules retain effective ranges, rest days, seven-day coverage, and overlap prevention", () => {
  assert.match(schema, /model EmployeeSchedule[\s\S]*?restDay\s+Boolean[\s\S]*?effectiveFrom\s+DateTime[\s\S]*?effectiveTo\s+DateTime\?/);
  const source = actionSource(payrollActions, "saveEmployeeScheduleAction", "deleteEmployeeScheduleAction");
  assert.match(source, /effectiveFrom: \{ lte: searchEnd \}/);
  assert.match(source, /effectiveTo: \{ gte: start \}/);
  assert.match(source, /const days = \[0, 1, 2, 3, 4, 5, 6\]/);
  assert.match(source, /Schedule overlaps an existing assignment/);
});

test("PAY-ATT-002: attendance corrections preserve before/after evidence and block direct mutation after payroll lock", () => {
  const save = actionSource(attendanceActions, "saveAttendanceAction", "deleteAttendanceAction");
  assert.match(save, /originalData: attendanceSnapshot\(existing\)/);
  assert.match(save, /adjustedData: attendanceSnapshot\(values\)/);
  assert.match(save, /status: AttendanceAdjustmentStatus\.APPROVED/);
  assert.match(attendanceActions, /status: \{ in: \[PayrollStatus\.FINALIZED, PayrollStatus\.POSTING, PayrollStatus\.POSTED, PayrollStatus\.POST_FAILED, PayrollStatus\.PAID\] \}/);
  assert.match(attendanceActions, /cannot be deleted\. Use a controlled payroll adjustment/);
});

test("PAY-OT-001: only approved overtime reaches calculation and employees cannot self-approve", () => {
  assert.match(payrollActions, /status: OvertimeStatus\.APPROVED/);
  assert.match(payrollService, /approvedOvertime/);
  assert.match(employeePayrollActions, /status: OvertimeStatus\.PENDING/);
  assert.match(employeePayrollActions, /source: OvertimeSource\.APPROVED_REQUEST/);
  assert.doesNotMatch(employeePayrollActions, /reviewedById: user\.id/);
});

test("PAY-DED-001 PAY-LOAN-001: deductions are tenant-scoped, draft/calculated-only, balance-capped, and applied through idempotent payment", () => {
  const source = actionSource(payrollActions, "savePayrollDeductionAction", "deletePayrollDeductionAction");
  assert.match(source, /payrollPeriod\.findFirst\(\{ where: \{ id: payrollId, tenantId: user\.tenantId \}/);
  assert.match(source, /employeeProfile\.findFirst\(\{ where: \{ id: employeeId, tenantId: user\.tenantId \}/);
  assert.match(source, /MUTABLE_PAYROLL_STATUSES\.includes\(period\.status\)/);
  assert.match(source, /Repayment cannot exceed the available loan balance/);
  assert.match(financeService, /eventType === PayrollPostingEventType\.PAYMENT/);
  assert.match(financeService, /applyLoanRepayments/);
  assert.match(financeService, /existing\?\.status === PayrollPostingStatus\.POSTED/);
});

test("PAY-RUN-002: finalization requires calculated immutable payslip evidence and audits actor plus transition", () => {
  const finalization = actionSource(payrollActions, "finalizePayrollAction", "returnPayrollToDraftAction");
  assert.match(finalization, /createImmutablePayrollRevision/);
  assert.match(finalization, /status: PayrollStatus\.CALCULATED/);
  assert.match(finalization, /status: PayrollStatus\.FINALIZED/);
  assert.match(finalization, /actorId: user\.id/);
  assert.match(finalization, /FINALIZE_PAYROLL_REVISION/);
  assert.match(payrollActions, /Calculate at least one employee payslip before finalizing/);
});

test("PAY-EMP-001: employee payslip HTML and PDF reads are owner-, tenant-, and paid-status scoped", () => {
  assert.match(employeePayslips, /tenantId: user\.tenantId, employeeId: user\.employeeProfile\.id/);
  assert.match(employeePayslips, /status: PayrollStatus\.PAID/);
  assert.match(employeePayslip, /findFirst\(\{ where: \{ id, tenantId: user\.tenantId \}/);
  assert.match(employeePayslip, /slip\.employeeId !== user\.employeeProfile\.id/);
  assert.match(employeePayslipPdf, /where: \{ id, tenantId: user\.tenantId \}/);
  assert.match(employeePayslipPdf, /slip\.employeeId !== user\.employeeProfile\.id/);
});

test("PAY-EMP-002: employee clock and correction flows derive owner/time server-side and enforce payroll locks", () => {
  assert.match(attendanceActions, /requireUser\(Role\.EMPLOYEE\)/);
  assert.match(attendanceActions, /todayInManila\(\)/);
  assert.match(attendanceActions, /timeInManila\(\)/);
  assert.match(attendanceActions, /employeeId: user\.employeeProfile\.id/);
  assert.match(attendanceActions, /assertAttendanceEditable/);
  assert.match(attendanceActions, /REQUEST_ATTENDANCE_CORRECTION/);
});

test("PAY-EMP-003: employee overtime submission is owner-scoped, duplicate-safe, locked, and review-only", () => {
  assert.match(employeePayrollActions, /employeeId = user\.employeeProfile\.id/);
  assert.match(employeePayrollActions, /tenantId: user\.tenantId/);
  assert.match(employeePayrollActions, /status: \{ in: \[OvertimeStatus\.PENDING, OvertimeStatus\.APPROVED\] \}/);
  assert.match(employeePayrollActions, /already included in \$\{lockedPeriod\.status\.toLowerCase\(\)\} payroll/);
  assert.match(employeePayrollActions, /status: OvertimeStatus\.PENDING/);
});

test("PAY-EMP-004: employee loan self-service exposes only the authenticated employee ledger and scheduled deductions", () => {
  assert.match(employeeLoans, /tenantId: user\.tenantId, employeeId: user\.employeeProfile\.id/);
  assert.match(employeeLoans, /payrollDeductions/);
  assert.match(employeeLoans, /amountPaid/);
  assert.match(employeeLoans, /balance/);
  assert.match(employeeLoans, /Scheduled payroll deductions/);
});

function actionSource(source: string, name: string, nextName: string) {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf(`export async function ${nextName}`, start);
  assert.notEqual(start, -1, `${name} must exist`);
  return source.slice(start, end === -1 ? source.length : end);
}
