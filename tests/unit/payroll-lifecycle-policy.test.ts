import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPayrollTransition,
  canDestructivelyDeletePayroll,
  canTransitionPayroll,
  deriveLifecycleState,
  isPayrollMutable,
  nextPayrollRevisionNumber,
  normalizePayrollCorrectionReason,
  payrollRevisionIdentity,
  requiresPayrollRevisionForCorrection,
} from "../../lib/payroll-lifecycle";

test("PAY-RUN-001: canonical lifecycle allows forward processing and bounded posting retry", () => {
  assert.equal(canTransitionPayroll("DRAFT", "CALCULATED"), true);
  assert.equal(canTransitionPayroll("CALCULATED", "FINALIZED"), true);
  assert.equal(canTransitionPayroll("FINALIZED", "POSTING"), true);
  assert.equal(canTransitionPayroll("POSTING", "POSTED"), true);
  assert.equal(canTransitionPayroll("POSTING", "POST_FAILED"), true);
  assert.equal(canTransitionPayroll("POST_FAILED", "POSTING"), true);
  assert.equal(canTransitionPayroll("POSTED", "PAID"), true);
  assert.equal(canTransitionPayroll("PAID", "DRAFT"), false);
});

test("PAY-RUN-003: finalized or later payroll cannot be corrected by direct mutation", () => {
  for (const state of ["FINALIZED", "POSTING", "POSTED", "POST_FAILED", "PAID"] as const) {
    assert.equal(requiresPayrollRevisionForCorrection(state), true);
    assert.equal(isPayrollMutable(state), false);
  }
  assert.throws(() => assertPayrollTransition("FINALIZED", "DRAFT"), /Invalid payroll lifecycle transition/);
});

test("PAY-RUN-003: destructive deletion remains draft-only", () => {
  assert.equal(canDestructivelyDeletePayroll("DRAFT"), true);
  assert.equal(canDestructivelyDeletePayroll("CALCULATED"), false);
  assert.equal(canDestructivelyDeletePayroll("FINALIZED"), false);
  assert.equal(canDestructivelyDeletePayroll("PAID"), false);
});

test("PAY-RUN-001: legacy persistence maps calculated draft periods without inventing persisted status", () => {
  assert.equal(deriveLifecycleState({ status: "DRAFT", payslipCount: 0 }), "DRAFT");
  assert.equal(deriveLifecycleState({ status: "DRAFT", payslipCount: 10 }), "CALCULATED");
  assert.equal(deriveLifecycleState({ status: "CALCULATED", payslipCount: 10 }), "CALCULATED");
  assert.equal(deriveLifecycleState({ status: "FINALIZED", payslipCount: 10 }), "FINALIZED");
  assert.equal(deriveLifecycleState({ status: "POSTING", payslipCount: 10 }), "POSTING");
  assert.equal(deriveLifecycleState({ status: "POST_FAILED", payslipCount: 10 }), "POST_FAILED");
  assert.equal(deriveLifecycleState({ status: "POSTED", payslipCount: 10 }), "POSTED");
  assert.equal(deriveLifecycleState({ status: "PAID", payslipCount: 10 }), "PAID");
});

test("PAY-RUN-003: revision identity is deterministic and monotonic", () => {
  assert.equal(nextPayrollRevisionNumber(undefined), 1);
  assert.equal(nextPayrollRevisionNumber(3), 4);
  assert.equal(
    payrollRevisionIdentity({ tenantId: "tenant-a", payrollId: "payroll-123", revisionNumber: 4 }),
    "tenant-a:payroll-123:R0004",
  );
});

test("PAY-RUN-003: correction reason is mandatory, bounded and normalized", () => {
  assert.equal(normalizePayrollCorrectionReason("  Correct   approved attendance entry  "), "Correct approved attendance entry");
  assert.throws(() => normalizePayrollCorrectionReason("short"), /at least 10 characters/);
  assert.throws(() => normalizePayrollCorrectionReason("x".repeat(501)), /must not exceed 500 characters/);
});
