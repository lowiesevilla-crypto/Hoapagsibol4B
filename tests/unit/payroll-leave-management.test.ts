import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { LeaveDayCountingMethod } from "@prisma/client";
import { assertLeaveEligibility, availableLeaveDays, calculateLeaveDates } from "../../lib/services/leave";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260824200000_employee_leave_management/migration.sql"), "utf8");
const actions = readFileSync(resolve(process.cwd(), "lib/actions/leave.ts"), "utf8");
const employeePage = readFileSync(resolve(process.cwd(), "app/employee/leave/page.tsx"), "utf8");
const adminPage = readFileSync(resolve(process.cwd(), "app/admin/leave/page.tsx"), "utf8");

const weekSchedule = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  restDay: dayOfWeek === 0,
  effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
  effectiveTo: null,
}));

test("PAY-EMP-005 PAY-ATT-001: working-day leave follows effective schedule and non-working calendar", () => {
  const dates = calculateLeaveDates({
    startDate: new Date("2026-08-24T00:00:00.000Z"),
    endDate: new Date("2026-08-30T00:00:00.000Z"),
    dayCountingMethod: LeaveDayCountingMethod.WORKING_DAYS,
    schedules: weekSchedule,
    calendarDays: [{ date: new Date("2026-08-26T00:00:00.000Z"), type: "REGULAR_HOLIDAY" }],
  });
  assert.equal(dates.requestedDays, 5);
  assert.deepEqual(dates.requestedDates, ["2026-08-24", "2026-08-25", "2026-08-27", "2026-08-28", "2026-08-29"]);
  assert.deepEqual(dates.attendanceDates, dates.requestedDates);
});

test("PAY-EMP-005: calendar-day protected leave retains calendar duration but links only scheduled payroll days", () => {
  const dates = calculateLeaveDates({
    startDate: new Date("2026-08-24T00:00:00.000Z"),
    endDate: new Date("2026-08-30T00:00:00.000Z"),
    dayCountingMethod: LeaveDayCountingMethod.CALENDAR_DAYS,
    schedules: weekSchedule,
    calendarDays: [{ date: new Date("2026-08-26T00:00:00.000Z"), type: "REGULAR_HOLIDAY" }],
  });
  assert.equal(dates.requestedDays, 7);
  assert.equal(dates.attendanceDates.length, 5);
});

test("PAY-EMP-005: service eligibility and annual balance fail closed", () => {
  assert.doesNotThrow(() => assertLeaveEligibility({ hireDate: new Date("2025-08-24T00:00:00.000Z"), leaveStartDate: new Date("2026-08-24T00:00:00.000Z"), eligibilityServiceMonths: 12 }));
  assert.throws(() => assertLeaveEligibility({ hireDate: new Date("2026-01-01T00:00:00.000Z"), leaveStartDate: new Date("2026-08-24T00:00:00.000Z"), eligibilityServiceMonths: 12 }), /requires 12 completed month/);
  assert.equal(availableLeaveDays({ entitlementDays: 5, carriedForwardDays: 1, adjustmentDays: -0.5, usedDays: 2 }), 3.5);
});

test("PAY-EMP-005: schema and migration persist protected formulas, requests, balances, ledger, and attendance linkage", () => {
  assert.match(schema, /model LeaveType/);
  assert.match(schema, /model LeaveRequest/);
  assert.match(schema, /model EmployeeLeaveBalance/);
  assert.match(schema, /model LeaveBalanceTransaction/);
  assert.match(schema, /statutoryProtected\s+Boolean/);
  assert.match(schema, /leaveRequestId\s+String\?/);
  assert.match(migration, /SERVICE_INCENTIVE_LEAVE/);
  assert.match(migration, /MATERNITY_LEAVE/);
  assert.match(migration, /PATERNITY_LEAVE/);
  assert.match(migration, /SOLO_PARENT_LEAVE/);
  assert.match(migration, /VAWC_LEAVE/);
  assert.match(migration, /SPECIAL_LEAVE_FOR_WOMEN/);
  assert.match(migration, /DOLE Handbook on Workers Statutory Monetary Benefits/);
});

test("PAY-EMP-005 PAY-SEC-001: employee ownership, formula protection, approval and payroll locks are server-enforced", () => {
  assert.match(actions, /id: user\.employeeProfile!\.id, tenantId: user\.tenantId/);
  assert.match(actions, /statutoryProtected\) throw new Error\("Statutory leave formulas are protected/);
  assert.match(actions, /status: \{ in: lockedPayrollStatuses \}/);
  assert.match(actions, /leaveBalanceTransaction\.create/);
  assert.match(actions, /attendance\.createMany/);
  assert.match(actions, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(actions, /Only your own pending leave request can be cancelled/);
});

test("PAY-EMP-005: employee and admin surfaces expose request, status, balance, configuration and review workflows", () => {
  assert.match(employeePage, /File a leave request/);
  assert.match(employeePage, /days available/);
  assert.match(employeePage, /My leave requests/);
  assert.match(adminPage, /Leave approval queue/);
  assert.match(adminPage, /Add tenant leave type/);
  assert.match(adminPage, /Adjust annual balance/);
  assert.match(adminPage, /Protected formula/);
});
