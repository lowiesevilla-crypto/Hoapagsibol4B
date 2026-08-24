# HOAHub Petty Cash Voucher Implementation Status

Last updated: 2026-08-24

Implementation branch: `feat/petty-cash-voucher-urgent-fixes-20260824`

## Commercial and Access Contract

- `PCV-001` — Petty Cash Voucher is an additional tenant subscription feature identified by feature code `PETTY_CASH_VOUCHER`.
- Platform commercial plan create/edit screens expose a Petty Cash Voucher checkbox.
- Tenant access resolves the active subscription plan feature entitlement plus any tenant override.
- `/admin/petty-cash` requires the Billing module dependency, `EXPENSES_MANAGE`, and the Petty Cash Voucher feature entitlement.
- The Admin shell hides Petty Cash from navigation/command search when the feature is not entitled and blocks direct route access.

Status: IMPLEMENTED on the feature branch. Exact-head CI/UAT remains pending.

## Voucher Workflow

- `PCV-002` — Tenant expense categories are the authoritative Particular list. Selecting `Other` and entering a new Particular creates/reactivates a tenant `ExpenseCategory` for reuse.
- `PCV-003` — Payee supports Employee, Homeowner, Renter, Contractor, and Other. Tenant directories are tenant-scoped. Saved address auto-populates; when no address exists the Admin may type one. `Received By` is resolved from the selected payee/name.
- `PCV-004` — Voucher number is generated with tenant/year sequence identity using `PCV-YYYY-######`. Voucher supports multiple Particular/Amount rows and a computed total.
- `PCV-005` — Approval may be the current authenticated Admin or an active tenant Organization Officer. Voucher print is the compact half-A4/A5 voucher format and includes tenant logo, tenant name, address, TIN/SEC information when configured, voucher number/date, particulars, total, and Approved By/Received By signature lines. Officer signature images are not exposed on the voucher.
- `PCV-006` — Each voucher item posts a tenant-scoped `Expense` in the same database transaction using the selected Expense Category, voucher number/reference, payee, transaction date, and amount. Voucher/item records link back to the created expense entries for traceability.

Status: IMPLEMENTED on the feature branch. Exact-head CI/UAT remains pending.

## Employee Cash Advance / Payroll

- `PCV-007` — A Particular named `Employee Cash Advance` requires tenant Payroll + Loans modules, an active employee, and a deduction amount per cutoff.
- Voucher creation creates an `EmployeeLoan` with type `CASH_ADVANCE`, principal/balance equal to the Employee Cash Advance voucher amount, reference number equal to the Petty Cash Voucher number, and stores the configured deduction-per-cutoff schedule on the Petty Cash Voucher.
- Existing payroll repayment integrity applies an Employee Loan repayment only when the related payroll is marked PAID and caps repayment against remaining available loan balance.

Status: PARTIAL. The automatic materialization of the configured Petty Cash deduction into each eligible payroll cutoff is intentionally NOT wired yet.

### PR #166 Integration Gate

PR #166, `Complete payroll statutory, finance, and leave workflows`, is currently active and modifies payroll actions, Prisma payroll schema, finance services, `Agent.md`, `components/sidebar-links.ts`, and `lib/module-routing.ts` among other files. Do not add a competing Petty Cash payroll/finance hook while that PR is open.

After PR #166 is merged:

1. Refresh this branch from latest `main` and resolve `components/sidebar-links.ts` / `lib/module-routing.ts` by preserving both PR #166 behavior and Petty Cash navigation/module rules.
2. Re-read the final `lib/actions/payroll.ts`, payroll finance service, Prisma schema, and payroll implementation ledger.
3. Implement idempotent automatic Petty Cash Employee Cash Advance deduction materialization for eligible mutable payroll cutoffs.
4. Deduction amount per cutoff must be `min(configured deduction, remaining unreserved loan balance)`; stop at zero; the last deduction may be smaller than the configured amount.
5. Account for unpaid/reserved payroll deductions so repeated payroll calculation/recalculation cannot over-reserve a loan balance.
6. Preserve the `employeeLoanId` relationship so marking payroll PAID reduces `EmployeeLoan.amountPaid`/`balance` through the authoritative payroll repayment path.
7. Update payroll requirement traceability only if final PR #166 governance requires a new/changed `PAY-*` mapping; do not claim VERIFIED without exact-head evidence.

## Privacy and Receipt/AR Regression Requirements

- `URG-PRIV-001` — Organization Officer signature images must not be exposed in homeowner-facing Organization/Community views. Status: IMPLEMENTED on this branch.
- Receipt / Acknowledgement Receipt is separate from Petty Cash Voucher. Downloaded Receipt/AR PDF remains full A4 portrait. Browser printing uses A4 portrait paper with the Receipt/AR content rendered at a half-A4 footprint in portrait orientation; do not generate an A5 Receipt/AR PDF.

## UX Acceptance

- `PCV-UX-001` — Petty Cash Admin UI must be clean, guided, responsive, and easy to navigate. Payee type/search, dynamic voucher items, Employee Cash Advance controls, approval choice, total, and final posting action are progressively disclosed and mobile-friendly.

Status: IMPLEMENTED on the feature branch. Visual/UAT evidence remains pending.

## Merge Rule

Do not merge this Petty Cash branch to `main` until PR #166 has completed its required release gate and has been merged, this branch has been reconciled with the resulting `main`, the Employee Cash Advance automatic payroll deduction hook is completed against the final payroll contract, `Agent.md` is updated, and exact-head applicable CI/UAT is green.
