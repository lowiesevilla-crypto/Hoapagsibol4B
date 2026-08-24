# Payroll Statutory, Financial Posting, and Leave Contract

Last updated: 2026-08-24
Tasks: `PAY-TASK-006`, `PAY-TASK-007`, `PAY-TASK-009`
Verification status: `VERIFIED` by PR #166 HOAHub MySQL CI #1114 and Canva Visual Parity #302 at `f596c850a113bcd73d50d5a71116e9951685ffdb`; the documentation-only verification head must pass both checks before merge.

## Effective-dated Philippine rules

`PayrollStatutoryRuleSet` is global legal-rule evidence selected by jurisdiction and payroll pay date. A payroll period, every calculated payslip, and every immutable calculation revision retain the applicable rule-set identity and snapshot. Existing historical payroll is intentionally not relabeled.

The first persisted rule set is `PH_STATUTORY_2025_2026_V1`, effective 2025-01-01 until superseded by a later reviewed row. It was verified as of 2026-08-24 against official sources:

- DOLE / Bureau of Working Conditions, *Handbook on Workers’ Statutory Monetary Benefits, 2024 Edition*: overtime, rest day, holiday, night differential, and statutory leave definitions.
- BIR Revenue Regulations No. 11-2018 Annex E: compensation withholding tables effective 2023 onward.
- SSS Circular No. 2024-006 / 2025 contribution table: 15% total contribution with the employee/employer split and EC schedule effective January 2025.
- PhilHealth Advisory No. 2025-0002: 5% premium with the applicable income floor/ceiling.
- Pag-IBIG Circular No. 460: employee/employer membership savings and the ₱10,000 maximum fund salary effective February 2024.

Official source URLs and resolved formula parameters are stored in the migration and `sourceSnapshot`. A legal update requires a new effective-dated immutable row and tests at boundaries; changing the current JSON row in place is prohibited.

## Financial Engine posting

Financial posting identity is `tenantId + payroll calculation revision + event type` and is persisted in both `PayrollPostingOutbox` and `PayrollFinancialPosting`. A second request for an already posted identity returns the existing result. Failed delivery reuses the same identity and cannot create a duplicate `FinancialJournalEntry`.

Lifecycle:

1. `FINALIZED -> POSTING -> POSTED`: post the accrual journal.
2. `POSTING -> POST_FAILED`: retain bounded error evidence; retry returns to `POSTING` with the same idempotency key.
3. `POSTED -> PAID`: post net-pay disbursement, then apply employee-loan deductions once in the same transaction.
4. A posted/paid reversal first requires immutable `REVERSAL` calculation evidence, then posts a separate `REVERSAL` event linked to its source revision/posting.

The accrual recognizes gross wage and employer contribution expense, statutory liabilities, payroll-deduction clearing, and net-pay payable. Payment clears net-pay payable to cash and loan-deduction clearing to employee-loan receivable. A paid reversal uses payroll recovery/loan receivable evidence rather than pretending cash was automatically recovered.

Financial reports recognize payroll expense only after `POSTED`/`PAID` and use gross pay plus employer contributions. Cash reports recognize net-pay outflow only after `PAID`.

## Leave management

`LeaveType` is tenant configurable. Every `LeaveRequest` snapshots the resolved policy and the exact requested/payroll-attendance dates. `EmployeeLeaveBalance` is annual materialized balance evidence backed by `LeaveBalanceTransaction` entitlement, adjustment, usage, and reversal types.

Employee submission is owner scoped and enforces:

- active employee and active same-tenant leave type;
- service eligibility and per-request maximum;
- effective employee schedule and tenant non-working calendar;
- no overlap with pending/approved leave;
- no direct change to finalized/posted/paid payroll dates;
- sufficient annual balance after pending reservations where a balance applies.

Authorized Payroll Manager, HR Admin, or System Administrator review remains server-authoritative. Approval revalidates payroll locks and balance inside one Serializable transaction, consumes balance once, writes the usage ledger, and creates linked `PAID_LEAVE`/`UNPAID_LEAVE` attendance. `TRACK_ONLY` leave records approval without manufacturing ordinary wage attendance.

Protected statutory rows cannot be edited or deactivated through tenant actions. They are starting legal controls, not automatic proof of employee eligibility. HR must validate each qualifying event and evidence under the cited authority.

## Acceptance boundary

Completion requires Prisma validation/generation, a clean MySQL migration and seed, full unit and integration suites, tenant/RBAC acceptance evidence, lint, typecheck, production build, production smoke, critical browser suite, and visual parity on the exact PR head. CI success is not production deployment confirmation.
