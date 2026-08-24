# HOAHub Payroll Implementation Progress Report

Last updated: 2026-08-24
Source of truth: `docs/payroll/PAYROLL_IMPLEMENTATION_STATUS.json`
Current candidate branch: `codex/payroll-completion-20260824`
Current candidate tasks: `PAY-TASK-006`, `PAY-TASK-007`, `PAY-TASK-009`, and the remaining acceptance-evidence closure

## Executive status

PR #165 is merged to `main` at `8b6f07f2b9139ee89d104414a3e17e94d6c1f366`. Its lifecycle requirements remain `VERIFIED` by exact-head HOAHub MySQL CI #1111 and Canva Visual Parity #300.

The current candidate implements every previously pending payroll task:

- `PAY-TASK-006` — effective-dated Philippine statutory rules and immutable payroll evidence.
- `PAY-TASK-007` — idempotent Financial Engine accrual/payment/reversal posting, durable outbox, retry, and reconciliation.
- `PAY-TASK-009` — protected statutory/custom leave types, employee requests, balances/ledger, approval, and attendance/payroll integration.
- Acceptance coverage for requirements that were already implemented but lacked direct requirement-tagged evidence.

These candidate changes remain `IMPLEMENTED` until the complete exact-head PR gate passes. `VERIFIED` is not inferred from local code or focused tests.

## Current candidate implementation

### Statutory calculation evidence

- Added immutable `PayrollStatutoryRuleSet` persistence selected by jurisdiction/effective pay date.
- Persisted official source metadata and formulas for DOLE labor premiums, SSS, PhilHealth, Pag-IBIG, and BIR compensation withholding.
- Payroll now resolves the applicable rule set, calculates employee/employer components, and stores rule/calculation evidence on each payslip and final revision.
- Admin payroll, employee payslip HTML, print, and PDF expose statutory breakdowns.

### Financial Engine posting

- Added `FinancialJournalEntry`, `FinancialJournalLine`, `PayrollPostingOutbox`, and `PayrollFinancialPosting`.
- Posting identity is tenant + immutable revision + event type.
- `FINALIZED` posts accrual to `POSTED`; `POST_FAILED` is retryable with the same idempotency key; only posted payroll can record disbursement and reach `PAID`.
- Payment applies employee-loan repayments once. Reversal restores loan receivable evidence where required.
- Admin payroll exposes event, outbox/error, journal lines, and idempotency reconciliation.
- Finance reports recognize payroll expense at `POSTED`/`PAID` using gross plus employer contributions; cash outflow uses paid net payroll only.

### Leave management

- Added tenant-scoped `LeaveType`, `LeaveRequest`, `EmployeeLeaveBalance`, and `LeaveBalanceTransaction`.
- Seeded protected Service Incentive, Maternity, Paternity, Solo Parent, VAWC, and Special Leave for Women definitions with official source snapshots.
- Tenant administrators can add/edit custom leave but cannot edit/deactivate protected statutory formulas.
- Employees can submit/cancel their own pending requests and see request history and balances.
- Authorized HR/payroll review is tenant scoped. Approval atomically consumes balance and creates linked paid/unpaid attendance outside locked payroll.
- Working/calendar day calculation uses effective employee schedule plus tenant payroll calendar and is snapshotted per request.

### Acceptance coverage

- Added direct acceptance tests for Agent governance, Payroll RBAC, schedules, attendance corrections, approved OT, deductions/loans, finalization, employee payslips/time/overtime/loans, statutory rules, finance posting, and leave.
- Employee payslip HTML/PDF reads now explicitly include authenticated tenant scope in addition to owner and paid-status checks.

## Local evidence

- Prisma validate: passed.
- Prisma generate: passed.
- TypeScript typecheck: passed.
- ESLint with zero warnings: passed.
- Full unit suite: 417/417 passed before the final acceptance/doc-only additions; focused new acceptance tests also pass.
- A local clean MySQL migration/integration run was unavailable because local MySQL/Docker is not running. The required clean MySQL migration, seed, integration, build, smoke, and browser evidence remains the exact-head CI gate.

## Required release gate

1. Keep `PAY-TASK-006`, `PAY-TASK-007`, `PAY-TASK-009`, and newly covered requirements at `IMPLEMENTED` until the PR number is known and documentation is prepared for that candidate.
2. Run the full HOAHub MySQL CI and Canva Visual Parity workflows on the exact documented head.
3. Move the candidate requirements/tasks to `VERIFIED` only on the documented exact head and only if every required check passes.
4. Merge only that passing head.
5. Verify Hostinger deployment separately; CI/merge alone is not production confirmation.

## Remaining blockers

No known implementation blocker remains. Verification and production deployment are separate gates, not implementation dependencies.
