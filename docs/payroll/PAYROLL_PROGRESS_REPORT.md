# HOAHub Payroll Implementation Progress Report

Last updated: 2026-08-24
Source of truth: `docs/payroll/PAYROLL_IMPLEMENTATION_STATUS.json`
Current candidate branch: `codex/payroll-schedules-controls-latest-20260824`
Current pull request: draft PR #171
Current candidate task: `PAY-TASK-011`

## Executive status

PR #165 is merged to `main` at `8b6f07f2b9139ee89d104414a3e17e94d6c1f366`. Its lifecycle requirements remain `VERIFIED` by exact-head HOAHub MySQL CI #1111 and Canva Visual Parity #300.

PR #166 completed and verified every previously pending payroll task and merged to `main` at `57a10d5f17dff7e98474997178852162ca6edf9a`:

- `PAY-TASK-006` — effective-dated Philippine statutory rules and immutable payroll evidence.
- `PAY-TASK-007` — idempotent Financial Engine accrual/payment/reversal posting, durable outbox, retry, and reconciliation.
- `PAY-TASK-009` — protected statutory/custom leave types, employee requests, balances/ledger, approval, and attendance/payroll integration.
- Acceptance coverage for requirements that were already implemented but lacked direct requirement-tagged evidence.

The implementation head `f596c850a113bcd73d50d5a71116e9951685ffdb` passed exact-head HOAHub MySQL CI #1114 and Canva Visual Parity #302. The product owner separately confirmed the Hostinger production deployment completed for that baseline.

`PAY-TASK-011` is the current, not-yet-released candidate. It adds:

- `PAY-DED-002` — one-time, recurring, and until-fully-paid schedules with From/To dates and optional installment limits.
- `PAY-LOAN-002` — idempotent automatic loan installments capped at the remaining unreserved balance; only paid-payroll Financial Engine posting mutates the loan ledger.
- `PAY-STAT-003` — effective-dated tenant defaults and employee overrides for the statutory master switch, SSS, PhilHealth, Pag-IBIG, and withholding-tax applicability. Official rules remain system-controlled.
- `PAY-UX-001` — six primary admin payroll tasks, a visible run lifecycle, responsive navigation, schedule management, and read-only employee visibility.

The four new requirements and `PAY-TASK-011` are `IMPLEMENTED`, not `VERIFIED`. PR #168 merged to `main` at `a1f2f05` and remains the owner of Petty Cash Voucher issuance/cash-advance source integration. This candidate was transplanted onto that exact main state and preserves both materializers; PR #167's billing work and PR #170's receipt-print work remain outside payroll scope.

## Verified implementation

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

- Multi-file Prisma validate: passed on the `PAY-TASK-011` candidate.
- Prisma generate: passed on the `PAY-TASK-011` candidate.
- TypeScript typecheck: passed on the `PAY-TASK-011` candidate.
- Targeted generic-schedule/statutory/Petty-Cash/requirement integration tests: 13/13 passed locally on latest main.
- Full unit suite: 442/442 passed locally on latest main.
- Full ESLint with zero warnings: passed locally.
- Next.js production build: passed locally on latest main, including all 48 routes and build-time lint/type validation.
- Clean MySQL migration/seed and exact-head workflows remain pending for the current candidate.
- The prior PR #166 clean migration, seed, finance, production smoke, critical browser, and visual evidence remains valid only for its exact tested head.

## Required release gate

1. Keep draft PR #171 isolated from the user's unrelated dirty Prisma split-schema files and concurrent non-payroll work.
2. Run clean MySQL migration/seed, full HOAHub MySQL CI, and the applicable visual/browser gate on the exact PR head.
3. Preserve merged PR #168's Petty Cash Voucher ownership and both payroll materializers through review.
4. Merge only a passing exact head, then verify Hostinger deployment separately.

## Remaining blockers

No implementation blocker is currently known. Exact-head PR checks, review, merge, and separate deployment confirmation remain.
