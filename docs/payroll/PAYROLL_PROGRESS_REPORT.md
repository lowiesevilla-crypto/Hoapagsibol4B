# HOAHub Payroll Implementation Progress Report

Last updated: 2026-08-24
Source of truth: `docs/payroll/PAYROLL_IMPLEMENTATION_STATUS.json`
Current delivery branch: `feat/payroll-lifecycle-revisions-20260824`
Current delivery PR: #165
Current delivery task: `PAY-TASK-005`

## Executive status

The payroll enhancement continues incrementally over the existing HOAHub payroll domain. Existing attendance, payroll periods, payslips, deductions, employee loans, overtime, schedules, payroll access and reporting are retained and hardened rather than replaced.

PR #164 passed exact-head HOAHub MySQL CI #1108 and Canva Visual Parity #298 at `aafe4eef87454745064b4c52178b610087b78119` and was merged to `main` at `bb7588a524847b23f68430e92d92e48a6065e589`. `PAY-COMP-001`, `PAY-COMP-002`, `PAY-COMP-003`, and `PAY-TASK-004` are now `VERIFIED`.

`PAY-TASK-005` delivered expanded payroll lifecycle and first-class immutable correction/revision/reversal evidence. Exact-head HOAHub MySQL CI #1111 and Canva Visual Parity #300 passed at `1743245f3d676f50fe026cf6831e9663ab8a666b`; `PAY-RUN-001`, `PAY-RUN-003`, and `PAY-TASK-005` are `VERIFIED`.

## Completed / Verified

- `PAY-COMP-001/002/003` / `PAY-TASK-004` — independent compensation basis, pay frequency and attendance policy; effective-dated employee compensation versions; payroll cutoff resolution; immutable payslip configuration snapshots; exact-head PR #164 CI passed and the candidate merged.
- `PAY-RUN-001/003` / `PAY-TASK-005` — expanded persisted lifecycle, immutable calculation revisions and employee snapshots, controlled corrections, reversal evidence, migration/backfill, and tenant-scoped admin UX; exact-head PR #165 MySQL CI #1111 and Visual Parity #300 passed.
- `PAY-RPT-001` / `PAY-TASK-010` — dedicated tenant-scoped payroll report, payout-date/status filters, employee breakdown, deterministic totals, print and CSV export; exact-head PR #163 CI passed.
- Employee mobile Time/timelog correction/overtime/loan self-service from PR #161 remains implemented with exact-head CI evidence.
- Finalized payroll pre-reopen snapshot and draft-only destructive deletion safeguards from PR #162 remain implemented with exact-head CI evidence.

## Implemented on current branch — PAY-TASK-005

### Persisted lifecycle

- Expanded `PayrollStatus` to `DRAFT`, `CALCULATED`, `FINALIZED`, `POSTING`, `POSTED`, `POST_FAILED`, and `PAID`.
- Payroll generation/recalculation now persists `CALCULATED` after payslips are refreshed.
- Only `DRAFT` and `CALCULATED` working data is mutable. Finalized, posting, posted, failed-posting, and paid data is locked from ordinary recalculation and deduction/attendance mutation.
- Finance posting states are persisted but intentionally have no transition action until `PAY-TASK-007` provides the idempotent Financial Engine posting/outbox contract.

### Immutable revisions and deltas

- Added tenant-scoped `PayrollCalculationRevision` and `PayrollCalculationRevisionPayslip` persistence.
- Each finalized revision stores a monotonic number, revision type, lifecycle state, source/parent revision, actor, reason, period/deduction/attendance/overtime snapshots, totals, and total/per-employee deltas.
- The migration backfills existing calculated/finalized/paid payroll into deterministic revision-1 evidence without rewriting historical payslips.
- Finalization creates the immutable revision inside the same Serializable transaction before the payroll status changes to `FINALIZED`.

### Corrections and reversals

- Finalized unpaid payroll starts a controlled correction from its latest immutable source revision and requires a normalized 10–500 character reason.
- Correction work returns only the mutable working calculation to `CALCULATED`; the source revision remains immutable. Re-finalization creates a new child revision with deltas.
- Finalized/posted/paid payroll may receive one immutable reversal revision with negative totals/deltas and a required reason. The source payroll and source revision are not mutated or deleted.
- Paid payroll remains terminal. Financial posting/reversal linkage remains deferred to `PAY-TASK-007`.

### Tenant-scoped admin UX

- Payroll-period, payslip, deduction, revision, employee, loan, calendar, schedule, access, audit, and overtime reads on the payroll page are authenticated-tenant scoped.
- Admin payroll shows explicit calculated state, correction/reversal reason controls, terminal paid messaging, and immutable revision history.
- Expanded statuses are available in payroll and attendance report/filter surfaces.

### Regression coverage

- `tests/unit/payroll-lifecycle-policy.test.ts` covers valid/invalid transitions, mutability, destructive deletion, legacy state derivation, revision numbering/identity, and correction reason validation.
- `tests/unit/payroll-lifecycle-immutability.test.ts` covers correction, finalization ordering, reversal evidence, tenant scope, and draft-only deletion.
- `tests/unit/payroll-lifecycle-revision-persistence.test.ts` covers schema, migration/backfill, parent/reversal relations, deltas, tenant boundaries, and UI requirements.

## Verification evidence

- Exact-head PR #165 HOAHub MySQL CI #1111 passed migration, seed, full unit/integration verification, lint, typecheck, production build, controlled Chromium, production smoke, and critical browser tests.
- Exact-head PR #165 Canva Visual Parity #300 passed and uploaded comparison renders.
- Local validation also passed Prisma validate/generate, 401 unit tests, lint, typecheck, and production build.

## Pending / Not started

- `PAY-STAT-002` — statutory rule snapshot per finalized payroll.
- `PAY-FIN-001` — idempotent payroll posting into the Financial Engine.
- `PAY-FIN-002` — durable outbox/retry/reconciliation.
- `PAY-FIN-003` — payroll expense/liability traceability.

## Blocked

- `PAY-STAT-001` / `PAY-TASK-006` — effective-dated Philippine statutory rule sets require authoritative verified source tables/effective dates.
- `PAY-EMP-005` / `PAY-TASK-009` — leave self-service requires the `LeaveType`/`LeaveRequest`/`LeaveBalance` persistence and approval domain.

## Next implementation sequence

1. Merge PR #165 only while its exact reviewed head remains green; verify production separately.
2. Implement verified effective-dated statutory rule sets and snapshots (`PAY-STAT-001/002`, `PAY-TASK-006`).
3. Implement idempotent Financial Engine posting/outbox/reconciliation (`PAY-FIN-001/002/003`, `PAY-TASK-007`) using the persisted payroll revision identity.
4. Implement tenant-configurable employee leave (`PAY-EMP-005`, `PAY-TASK-009`).

## Definition of completion

`VERIFIED` is the only completion status. Code presence alone remains `IMPLEMENTED`. A requirement moves to `VERIFIED` only when linked acceptance evidence passes for the exact candidate SHA and no known blocker contradicts the requirement.
