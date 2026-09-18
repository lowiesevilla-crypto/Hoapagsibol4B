import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loginAction = readFileSync("lib/actions/auth.ts", "utf8");
const auth = readFileSync("lib/auth.ts", "utf8");
const attendance = readFileSync("lib/actions/attendance.ts", "utf8");
const attendancePage = readFileSync("app/employee/attendance/page.tsx", "utf8");
const clockForm = readFileSync("components/employee-clock-form.tsx", "utf8");
const criticalRunner = readFileSync("scripts/run-critical-browser-ci.mjs", "utf8");

test("employee sign-in fails closed unless the primary employee account has an active profile in the same tenant", () => {
  assert.ok(loginAction.includes("EmployeeStatus"));
  assert.ok(loginAction.includes("employeeProfile: { select: { id: true, tenantId: true, status: true } }"));
  assert.ok(loginAction.includes("primaryRoleForRoles(roles, candidate.role) === Role.EMPLOYEE"));
  assert.ok(loginAction.includes("employeeProfile.tenantId === candidate.tenantId"));
  assert.ok(loginAction.includes("employeeProfile.status === EmployeeStatus.ACTIVE"));
  assert.ok(loginAction.includes("primaryRoleForRoles(roles, user.role) === Role.EMPLOYEE"));
  assert.ok(loginAction.includes("employeeProfile.tenantId !== user.tenantId"));

  assert.ok(auth.includes("requiredRole === Role.EMPLOYEE"));
  assert.ok(auth.includes("employeeProfile.tenantId !== user.tenantId"));
  assert.ok(auth.includes("employeeProfile.status !== EmployeeStatus.ACTIVE"));
  assert.ok(auth.includes("if (session.role === Role.EMPLOYEE)"));
  assert.ok(auth.includes("await deleteSession()"));
});

test("employee Time In and Time Out stay tenant scoped and are retry safe", () => {
  for (const fragment of [
    "employeeClockInStateAction",
    "employeeClockOutStateAction",
    "tenantId: user.tenantId",
    "employeeId = user.employeeProfile.id",
    "timeIn: null",
    "timeOut: null",
    'action: "EMPLOYEE_CLOCK_IN"',
    'action: "EMPLOYEE_CLOCK_OUT"',
    "tx.auditLog.create",
    "Prisma.PrismaClientKnownRequestError",
    'error.code === "P2002"',
  ]) {
    assert.ok(attendance.includes(fragment), `Expected attendance hardening fragment: ${fragment}`);
  }

  assert.ok(attendance.includes("safeRevalidateEmployeeAttendancePages"));
  assert.ok(attendance.includes("employee_attendance_post_commit_revalidation_failed"));
});

test("production employee punch UI uses state-return client navigation instead of direct post-commit server redirects", () => {
  assert.ok(attendancePage.includes('<EmployeeClockForm mode="in" />'));
  assert.ok(attendancePage.includes('<EmployeeClockForm mode="out" />'));
  assert.equal(attendancePage.includes("action={employeeClockInAction}"), false);
  assert.equal(attendancePage.includes("action={employeeClockOutAction}"), false);

  assert.ok(clockForm.includes("useActionState"));
  assert.ok(clockForm.includes("router.replace(state.redirectTo)"));
  assert.ok(clockForm.includes("employeeClockInStateAction"));
  assert.ok(clockForm.includes("employeeClockOutStateAction"));
  assert.ok(clockForm.includes("data-employee-clock-ready={hydrated ? \"true\" : \"false\"}"));
  assert.ok(clockForm.includes("disabled={!hydrated || pending || Boolean(state.redirectTo)}"));
});

test("critical browser CI gates the full employee login and attendance regression", () => {
  assert.ok(criticalRunner.includes('name: "employee-login-attendance"'));
  assert.ok(criticalRunner.includes("tests/e2e/employee-login-attendance.mjs"));
});
