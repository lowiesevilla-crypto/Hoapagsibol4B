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
- `lib/petty-cash/payroll-integration.ts` materializes each eligible Petty Cash schedule into the mutable payroll cutoff before payroll reads assigned deductions.
- Each Petty Cash voucher receives its own tenant-scoped Payroll Deduction Type (`Petty Cash · <voucher number>`), allowing multiple employee cash advances to coexist for the same employee and cutoff without violating payroll's unique deduction identity.
- Automatic deduction amount is `min(configured deduction, remaining unreserved EmployeeLoan balance)`. Existing unpaid payroll deductions linked to the loan are treated as reservations so repeated calculation/recalculation cannot over-reserve the balance. The final cutoff may therefore be smaller than the configured amount, and no new deduction is created when no available balance remains.
- The generated `PayrollDeduction` retains `employeeLoanId`. HOAHub does not introduce a second Petty Cash repayment ledger: PR #166's Financial Engine PAYMENT processor remains authoritative for actually increasing `EmployeeLoan.amountPaid`, decreasing `EmployeeLoan.balance`, closing the loan at zero, journal posting, retry/idempotency, and restoring the loan on a paid-payroll reversal.
- Payroll calculation traceability now maps the Petty Cash materialization hook to `PAY-DED-001` and `PAY-LOAN-001`. Because these previously VERIFIED requirements were extended on this branch, they are correctly recorded as IMPLEMENTED until the new exact head passes the required verification gate.

Status: IMPLEMENTED on the feature branch. Exact-head payroll/finance CI evidence remains pending.

### PR #166 Integration Result

PR #166, `Complete payroll statutory, finance, and leave workflows`, was merged to `main` at `57a10d5f17dff7e98474997178852162ca6edf9a` before the automatic Petty Cash payroll hook was completed.

This feature branch was reconciled with that merged baseline. PR #166 navigation/leave routes, statutory payroll rules, immutable revisions, Financial Engine posting/outbox, loan repayment processing, and reversal behavior were preserved. Petty Cash only supplies the scheduled Payroll Deduction input; it does not bypass or duplicate the PR #166 finance lifecycle.

## Privacy and Receipt/AR Regression Requirements

- `URG-PRIV-001` — Organization Officer signature images must not be exposed in homeowner-facing Organization/Community views. Status: IMPLEMENTED on this branch.
- Receipt / Acknowledgement Receipt is separate from Petty Cash Voucher. Downloaded Receipt/AR PDF remains full A4 portrait. Browser printing uses A4 portrait paper with the Receipt/AR content rendered at a half-A4 footprint in portrait orientation; do not generate an A5 Receipt/AR PDF.

## UX Acceptance

- `PCV-UX-001` — Petty Cash Admin UI must be clean, guided, responsive, and easy to navigate. Payee type/search, dynamic voucher items, Employee Cash Advance controls, approval choice, total, and final posting action are progressively disclosed and mobile-friendly.

Status: IMPLEMENTED on the feature branch. Visual/UAT evidence remains pending.

## Remaining Release Gate

Before merge to `main`:

1. Update `Agent.md` against the post-PR #166 operating contract.
2. Run the exact-head applicable test/typecheck/lint/Prisma/build/MySQL/browser/visual gates.
3. Resolve any test or migration finding without weakening tenant scope, payroll immutability, financial posting idempotency, or Receipt/AR print behavior.
4. Only promote `PAY-DED-001` / `PAY-LOAN-001` back to VERIFIED when the new exact Petty Cash head has linked acceptance evidence.
