import type { PayrollStatus } from "@prisma/client";

/**
 * @requirement PAY-RUN-001 PAY-RUN-003
 * @status IN_PROGRESS
 * @description Canonical lifecycle policy for payroll processing and immutable correction/revision handling. Persistence wiring for POSTING/POSTED/POST_FAILED and first-class revision rows remains pending.
 */
export const PAYROLL_LIFECYCLE_STATES = [
  "DRAFT",
  "CALCULATED",
  "FINALIZED",
  "POSTING",
  "POSTED",
  "POST_FAILED",
  "PAID",
] as const;

export type PayrollLifecycleState = (typeof PAYROLL_LIFECYCLE_STATES)[number];

export const PAYROLL_REVISION_TYPES = ["INITIAL", "CORRECTION", "REVERSAL", "DELTA"] as const;
export type PayrollRevisionType = (typeof PAYROLL_REVISION_TYPES)[number];

const ALLOWED_TRANSITIONS: Record<PayrollLifecycleState, readonly PayrollLifecycleState[]> = {
  DRAFT: ["CALCULATED"],
  CALCULATED: ["DRAFT", "FINALIZED"],
  FINALIZED: ["POSTING"],
  POSTING: ["POSTED", "POST_FAILED"],
  POST_FAILED: ["POSTING"],
  POSTED: ["PAID"],
  PAID: [],
};

export function isPayrollLifecycleState(value: string): value is PayrollLifecycleState {
  return (PAYROLL_LIFECYCLE_STATES as readonly string[]).includes(value);
}

export function canTransitionPayroll(from: PayrollLifecycleState, to: PayrollLifecycleState) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertPayrollTransition(from: PayrollLifecycleState, to: PayrollLifecycleState) {
  if (!canTransitionPayroll(from, to)) {
    throw new Error(`Invalid payroll lifecycle transition: ${from} -> ${to}.`);
  }
}

export function isPayrollMutable(state: PayrollLifecycleState) {
  return state === "DRAFT" || state === "CALCULATED";
}

export function requiresPayrollRevisionForCorrection(state: PayrollLifecycleState) {
  return state === "FINALIZED" || state === "POSTING" || state === "POSTED" || state === "POST_FAILED" || state === "PAID";
}

export function canDestructivelyDeletePayroll(state: PayrollLifecycleState) {
  return state === "DRAFT";
}

export function deriveLifecycleState(input: { status: PayrollStatus; payslipCount: number }): PayrollLifecycleState {
  if (input.status === "PAID") return "PAID";
  if (input.status === "FINALIZED") return "FINALIZED";
  return input.payslipCount > 0 ? "CALCULATED" : "DRAFT";
}

export function nextPayrollRevisionNumber(currentMaximum: number | null | undefined) {
  const normalized = Number.isInteger(currentMaximum) && Number(currentMaximum) >= 0 ? Number(currentMaximum) : 0;
  return normalized + 1;
}

export function payrollRevisionIdentity(input: { tenantId: string; payrollId: string; revisionNumber: number }) {
  const tenantId = input.tenantId.trim();
  const payrollId = input.payrollId.trim();
  if (!tenantId || !payrollId) throw new Error("Tenant and payroll identity are required for a payroll revision.");
  if (!Number.isInteger(input.revisionNumber) || input.revisionNumber < 1) throw new Error("Payroll revision number must be a positive integer.");
  return `${tenantId}:${payrollId}:R${String(input.revisionNumber).padStart(4, "0")}`;
}

export function normalizePayrollCorrectionReason(reason: string) {
  const normalized = reason.trim().replace(/\s+/g, " ");
  if (normalized.length < 10) throw new Error("Payroll correction reason must contain at least 10 characters.");
  if (normalized.length > 500) throw new Error("Payroll correction reason must not exceed 500 characters.");
  return normalized;
}
