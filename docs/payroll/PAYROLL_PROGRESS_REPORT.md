# HOAHub Payroll Implementation Progress Report

Last updated: 2026-08-24
Source of truth: `docs/payroll/PAYROLL_IMPLEMENTATION_STATUS.json`
Current delivery branch: `feat/payroll-effective-compensation-v2-20260824`
Current delivery PR: #164
Current delivery task: `PAY-TASK-004`

## Executive status

The payroll enhancement continues incrementally over the existing HOAHub payroll domain. Existing attendance, payroll periods, payslips, deductions, employee loans, overtime, schedules, payroll access and reporting are retained and hardened rather than replaced.

PR #161 (employee self-service) passed exact-head HOAHub MySQL CI #1089 and Canva Visual Parity #284 and was merged. PR #162 (finalized-payroll immutability safeguards) passed exact-head MySQL CI #1091 and Canva Visual Parity #285 and was merged. PR #163 (tenant-scoped payroll reporting) passed exact-head MySQL CI #1097 and Canva Visual Parity #290 and was merged to `main` at `a512ce45a73e7f6445e2d03406fdcff5bde9b5e4`; `PAY-RPT-001` is now `VERIFIED`.

The active implementation is `PAY-TASK-004`: effective-dated employee compensation, pay frequency and attendance policy. Code is `IMPLEMENTED` in PR #164 and remains unverified until exact-head CI and acceptance evidence pass.

## Completed / Verified

- `PAY-RPT-001` / `PAY-TASK-010` — dedicated tenant-scoped payroll report, payout-date/status filters, employee breakdown, deterministic totals, print and CSV export; exact-head PR #163 CI passed.
- Employee mobile Time/timelog correction/overtime/loan self-service from PR #161 remains implemented with exact-head CI evidence.
- Finalized payroll pre-reopen snapshot and draft-only destructive deletion safeguards from PR #162 remain implemented with exact-head CI evidence.

## Implemented on current branch — PAY-TASK-004

### Independent payroll configuration concepts
- Added `CompensationBasis`: `MONTHLY`, `DAILY`, `HOURLY`, `FIXED_PER_PERIOD`.
- Added `PayFrequency`: `SEMI_MONTHLY`, `MONTHLY`.
- Added `AttendancePolicy`: `REQUIRED`, `EXCEPTION_ONLY`, `NOT_REQUIRED`.
- Daily/hourly bases fail closed unless attendance is required.

### Effective-dated persistence and migration
- Added tenant-scoped `EmployeeCompensation` with effective from/to dates, rate, divisor/work hours, allowance/deduction, creator and indexes.
- Migration backfills every existing employee's legacy salary data into an initial effective-dated version at hire date.
- Existing `EmployeeProfile.salaryType/baseRate/...` fields remain as compatibility mirrors during migration; they are no longer payroll-history authority.
- New payroll-term changes create a new version and close the prior version instead of overwriting it.
- A backdated payroll-term change is rejected if it would overlap an existing finalized/paid payroll for that employee.

### Payroll resolution and historical snapshot
- Payroll resolves the employee configuration effective on the cutoff end date.
- Each new/recalculated payslip stores `compensationId` and an immutable `compensationSnapshot` containing basis, frequency, attendance policy, rate, divisor/work hours, allowance/deduction and effective range.
- If an unmigrated legacy employee is encountered, payroll retains an explicit `LEGACY_EMPLOYEE_PROFILE` fallback snapshot rather than silently inventing a configuration.
- Pre-migration payslips are not rewritten by the backfill migration.

### Admin UX
- Employee Payroll Configuration now separates compensation basis, pay frequency, attendance policy, effective date, rate, standard workdays and standard hours/day.
- Employee edit displays payroll configuration history with effective range, rate and creator.

### Regression coverage
- Added `tests/unit/payroll-effective-compensation.test.ts` covering monthly semi-monthly no-clock pay, exception-only deductions, fixed-per-period behavior, invalid daily/hourly no-clock combinations, schema/backfill/versioning and payslip snapshot wiring.

## Fixed

- Removed the legacy `SalaryType` overload from the authoritative payroll configuration path while retaining backward-compatible employee master fields.
- Prevented employee payroll-term edits from rewriting prior effective-dated versions.
- Prevented retroactive configuration changes across finalized/paid payroll history.
- Added explicit payslip configuration snapshots so later employee edits cannot silently change how a historical calculation is interpreted.
- PR #164 first CI candidate reached Prisma validation and client generation successfully, then exposed MySQL error 1059 because the generated effective-date index identifier exceeded MySQL's identifier length limit. The index is now explicitly mapped to `EmpComp_scope_effective_idx` in both Prisma schema and migration. A fresh exact-head CI run is required after this fix.

## In progress / pending verification

- `PAY-COMP-001`, `PAY-COMP-002`, `PAY-COMP-003`, `PAY-TASK-004` — `IMPLEMENTED`; exact-head MySQL CI, Prisma migration validation, typecheck/build and visual parity are still required before any move to `VERIFIED`.
- `PAY-RUN-003` / `PAY-TASK-005` — full first-class payroll revision/delta/reversal persistence remains `IN_PROGRESS`.

## Pending / Not started

- `PAY-STAT-002` — statutory rule snapshot per finalized payroll.
- `PAY-FIN-001` — idempotent payroll posting into the Financial Engine.
- `PAY-FIN-002` — durable outbox/retry/reconciliation.
- `PAY-FIN-003` — payroll expense/liability traceability.

## Blocked

- `PAY-RUN-001` — expanded payroll lifecycle requires coordinated schema/UI/action migration.
- `PAY-STAT-001` — effective-dated Philippine statutory rule sets require authoritative verified source tables/effective dates.
- `PAY-EMP-005` / `PAY-TASK-009` — leave self-service requires the LeaveType/LeaveRequest/LeaveBalance persistence and approval domain.

## Next implementation sequence

1. Pass exact-head CI for `PAY-TASK-004`; fix any remaining Prisma migration, TypeScript, calculation or UI issue before merge.
2. Complete first-class payroll lifecycle/revision/correction persistence (`PAY-RUN-001/003`, `PAY-TASK-005`).
3. Implement verified effective-dated statutory rule sets and snapshots (`PAY-STAT-001/002`, `PAY-TASK-006`).
4. Implement idempotent Financial Engine posting/outbox/reconciliation (`PAY-FIN-001/002/003`, `PAY-TASK-007`).
5. Implement tenant-configurable employee leave (`PAY-EMP-005`, `PAY-TASK-009`).

## Definition of completion

`VERIFIED` is the only completion status. Code presence alone remains `IMPLEMENTED`. A requirement moves to `VERIFIED` only when linked acceptance evidence passes for the exact candidate SHA and no known blocker contradicts the requirement.
