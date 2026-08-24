# HOAHub Payroll Implementation Progress Report

Last updated: 2026-08-24
Source of truth: `docs/payroll/PAYROLL_IMPLEMENTATION_STATUS.json`
Current delivery PR: #161 — `feat/payroll-employee-ess-20260824`

## Executive status

The payroll enhancement is being delivered as an incremental upgrade of the existing HOAHub payroll domain. Existing attendance, payroll periods, payslips, deductions, employee loans, overtime, schedules, payroll access, and reporting surfaces are retained and hardened rather than replaced.

The current employee self-service tranche is implemented on PR #161. Exact-head CI is still running, so requirements in this tranche remain `IMPLEMENTED` rather than `VERIFIED` until the candidate SHA completes all required checks successfully.

## Completed / Implemented

### Traceability and engineering governance
- `PAY-REQ-001` — machine-readable implementation registry exists and is validated by regression tests.
- `PAY-REQ-002` — `Agent.md` contains the payroll implementation/status protocol.
- Payroll implementation functions are mapped to stable `PAY-*` requirement IDs and controlled statuses.

### Security and tenant isolation
- `PAY-SEC-001` — payroll and attendance actions are authenticated and tenant-scoped.
- `PAY-SEC-002` — payroll administration remains server-authoritative and separate from employee self-service access.

### Attendance, shifts, overtime and calculations
- `PAY-SHIFT-001` — effective schedule ranges and overlap validation exist.
- `PAY-ATT-001` — payable attendance context is consumed by the payroll calculation service.
- `PAY-ATT-002` — attendance correction evidence is auditable and finalized/paid dates are locked from direct mutation.
- `PAY-OT-001` — only approved overtime is used for payroll calculation.
- `PAY-CALC-001/002/003` — calculation policy is explicit and deterministic, with non-negative rounded totals and regression coverage.

### Deductions and loans
- `PAY-DED-001` — draft payroll deductions are supported with tenant-scoped maintenance.
- `PAY-LOAN-001` — loan/cash-advance repayment is capped to the remaining balance and applied at payroll payment stage.

### Payroll lifecycle foundation
- `PAY-RUN-002` — finalization requires calculated payslips and records actor/audit evidence.

### Employee self-service
- `PAY-EMP-001` — employee payslip self-service exists.
- `PAY-EMP-002` — mobile Time In/Time Out, assigned-shift display, timelog history, correction requests, and payroll-date locking are implemented.
- `PAY-EMP-003` — employee overtime filing and request-status history are implemented; employee submissions are always pending until Payroll review.
- `PAY-EMP-004` — employee loan/cash-advance balance, amount paid/deducted, scheduled deductions, and deduction history are implemented.

## Fixed in the current review cycle

- Fixed PR #161 TypeScript failure caused by importing unsupported Lucide icon `Hourglass3`. The employee overtime page now uses the supported `Hourglass` export.
- Previous CI evidence before the icon fix already showed lint, Prisma validation/generation/migrations, unit tests, integration tests, payroll calculation-policy tests, and payroll requirement-status tests passing before typecheck reached the unsupported icon error.
- A fresh exact-head CI run was automatically triggered after the fix. This report intentionally does not mark the PR `VERIFIED` until that run completes.

## In progress

- `PAY-COMP-001` — compensation basis, pay frequency, and attendance policy are conceptually separated in calculation policy, but legacy persisted employee salary data still overloads `SalaryType`.
- `PAY-COMP-003` — historical integrity is partially enforced through finalized/paid attendance locks; full payroll revision/correction persistence is still required.
- `PAY-RUN-003` — finalized/paid evidence is increasingly protected, but the current controlled reopen/archive compatibility path must be replaced by a full revision/reversal model.
- `PAY-RPT-001` — payroll reports exist, but final acceptance must be aligned with the revised payroll lifecycle and Financial Engine posting model.

## Pending / Not started

- `PAY-STAT-002` — statutory rule snapshot per finalized payroll.
- `PAY-FIN-001` — idempotent payroll posting into the HOAHub Financial Engine.
- `PAY-FIN-002` — durable outbox/retry/reconciliation for payroll finance events.
- `PAY-FIN-003` — payroll expense/liability traceability through Financial Engine entries.

## Blocked pending foundation work

- `PAY-COMP-002` — effective-dated employee compensation/pay-frequency/attendance-policy persistence requires a Prisma migration, legacy employee backfill strategy, and historical snapshot design.
- `PAY-RUN-001` — expanded lifecycle requires coordinated Prisma enum/model migration and UI/action updates.
- `PAY-STAT-001` — Philippine statutory rule-set persistence remains blocked until authoritative tables/effective dates are verified and modeled safely.
- `PAY-EMP-005` — tenant-configurable leave types and employee leave filing require `LeaveType`, `LeaveRequest`, `LeaveBalance`, approval workflow, and statutory leave protection.

## Next implementation sequence

1. Finish PR #161 exact-head CI and resolve any remaining regression immediately.
2. Implement effective-dated employee payroll configuration (`PAY-COMP-001/002/003`) with backward-compatible migration from legacy `SalaryType`.
3. Implement payroll calculation revision/correction persistence and lifecycle expansion (`PAY-RUN-001/003`).
4. Implement effective-dated Philippine statutory rule sets and snapshotting (`PAY-STAT-001/002`) after authoritative rule verification.
5. Implement idempotent Financial Engine posting, outbox/retry, and accounting traceability (`PAY-FIN-001/002/003`).
6. Complete leave self-service and final payroll reporting acceptance (`PAY-EMP-005`, `PAY-RPT-001`).

## Definition of completion

`VERIFIED` is the only completion status. Code presence alone remains `IMPLEMENTED`. A requirement moves to `VERIFIED` only when its linked acceptance evidence passes for the release candidate and there is no known blocker that contradicts the requirement.
