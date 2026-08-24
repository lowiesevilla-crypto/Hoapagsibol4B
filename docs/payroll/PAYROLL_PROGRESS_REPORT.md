# HOAHub Payroll Implementation Progress Report

Last updated: 2026-08-24
Source of truth: `docs/payroll/PAYROLL_IMPLEMENTATION_STATUS.json`
Current delivery branch: `feat/payroll-immutable-finalized-20260824`

## Executive status

The payroll enhancement is being delivered incrementally over the existing HOAHub payroll domain. Existing attendance, payroll periods, payslips, deductions, employee loans, overtime, schedules, payroll access, and reporting surfaces are retained and hardened rather than replaced.

PR #161, the employee self-service tranche, passed exact-head HOAHub MySQL CI #1089 and HOAHub Canva Visual Parity #284 and was merged to `main` at merge commit `62020becf35c9acd554eb17f5db6f5c5dadcd463`.

The current lifecycle tranche is now implementing additional `PAY-RUN-003` safeguards. It is not complete or merged yet and remains subject to exact-head CI.

## Completed / Implemented

### Traceability and engineering governance
- `PAY-REQ-001` — machine-readable implementation registry exists and is validated by regression tests.
- `PAY-REQ-002` — `Agent.md` contains the payroll implementation/status protocol.
- Payroll implementation functions are mapped to stable `PAY-*` requirement IDs and controlled statuses.

### Security and tenant isolation
- `PAY-SEC-001` — payroll and attendance actions are authenticated and tenant-scoped.
- Attendance schedule/calendar derivation is explicitly tenant-scoped.
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
- `PAY-RUN-003` partial safeguard — finalized/paid attendance cannot be directly mutated.
- `PAY-RUN-003` partial safeguard — destructive payroll deletion is now restricted to `DRAFT` periods.
- `PAY-RUN-003` partial safeguard — before a finalized payroll can return to draft, HOAHub creates a full immutable pre-reopen `PayrollArchive` snapshot inside the same serializable transaction.

### Employee self-service — merged through PR #161
- `PAY-EMP-001` — employee payslip self-service exists.
- `PAY-EMP-002` — mobile Time In/Time Out, assigned-shift display, timelog history, correction requests, and payroll-date locking are implemented.
- `PAY-EMP-003` — employee overtime filing and request-status history are implemented; employee submissions are pending until Payroll review.
- `PAY-EMP-004` — employee loan/cash-advance balance, amount paid/deducted, scheduled deductions, and deduction history are implemented.

## Fixed

### PR #161 fixes — merged
- Fixed the employee overtime TypeScript/build failure by replacing unsupported Lucide `Hourglass3` with the supported `Hourglass` export.
- Fixed tenant leakage risk in attendance metric derivation by tenant-scoping employee schedules and payroll calendar-day lookup.
- Fixed unsafe correction-history JSON casting in the employee timelog page.
- Exact-head MySQL CI #1089 and Canva Visual Parity #284 passed before PR #161 was merged.

### Current lifecycle fixes — awaiting CI/merge
- Finalized and paid payroll periods can no longer be destructively deleted through `deletePayrollAction`.
- A finalized payroll is snapshotted before controlled return to draft, preserving period, employee/payslip, deduction, attendance-adjustment, and overtime evidence.
- Reopen snapshot creation, audit write, and status transition execute in a serializable transaction.
- Added `tests/unit/payroll-lifecycle-immutability.test.ts` to guard snapshot-before-reopen ordering and draft-only destructive deletion.

## In progress

- `PAY-COMP-001` — compensation basis, pay frequency, and attendance policy are conceptually separated in calculation policy, but legacy persisted employee salary data still overloads `SalaryType`.
- `PAY-COMP-003` — historical integrity now includes finalized/paid attendance locks and a pre-reopen payroll snapshot; a first-class payroll configuration and revision snapshot is still required.
- `PAY-RUN-003` / `PAY-TASK-005` — lifecycle hardening is now `IN_PROGRESS`. The full first-class revision/delta/reversal model is still pending after the compatibility safeguards in this branch.
- `PAY-RPT-001` — payroll reports exist, but final acceptance must be aligned with the revised payroll lifecycle and Financial Engine posting model.

## Pending / Not started

- `PAY-STAT-002` — statutory rule snapshot per finalized payroll.
- `PAY-FIN-001` — idempotent payroll posting into the HOAHub Financial Engine.
- `PAY-FIN-002` — durable outbox/retry/reconciliation for payroll finance events.
- `PAY-FIN-003` — payroll expense/liability traceability through Financial Engine entries.

## Blocked pending foundation work

- `PAY-COMP-002` / `PAY-TASK-004` — effective-dated employee compensation/pay-frequency/attendance-policy persistence requires a Prisma migration, legacy employee backfill strategy, admin UI, and historical snapshot design.
- `PAY-RUN-001` — expanded lifecycle requires coordinated Prisma enum/model migration and UI/action updates.
- `PAY-STAT-001` — Philippine statutory rule-set persistence remains blocked until authoritative tables/effective dates are verified and modeled safely.
- `PAY-EMP-005` — tenant-configurable leave types and employee leave filing require `LeaveType`, `LeaveRequest`, `LeaveBalance`, approval workflow, and statutory leave protection.

## Next implementation sequence

1. Complete exact-head CI for the current immutable-finalized payroll safeguards and merge only if all required workflows are green.
2. Implement effective-dated employee payroll configuration (`PAY-COMP-001/002/003`) with backward-compatible migration from legacy `SalaryType`.
3. Complete first-class payroll calculation revision/correction persistence and lifecycle expansion (`PAY-RUN-001/003`).
4. Implement effective-dated Philippine statutory rule sets and snapshotting (`PAY-STAT-001/002`) after authoritative rule verification.
5. Implement idempotent Financial Engine posting, outbox/retry, and accounting traceability (`PAY-FIN-001/002/003`).
6. Complete leave self-service and final payroll reporting acceptance (`PAY-EMP-005`, `PAY-RPT-001`).

## Definition of completion

`VERIFIED` is the only completion status. Code presence alone remains `IMPLEMENTED`. A requirement moves to `VERIFIED` only when its linked acceptance evidence passes for the exact release candidate and there is no known blocker that contradicts the requirement.
