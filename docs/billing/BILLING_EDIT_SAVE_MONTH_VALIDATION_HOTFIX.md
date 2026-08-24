# Billing Edit Save Month Validation Hotfix

Date: 2026-08-24

## User-reported issue

An authorized administrator could open an existing bill in `/admin/billing`, but selecting **Save bill** produced the global request error page instead of saving the edit.

## Root cause

The Edit Bill form uses an HTML month control. Browsers submit that control as `YYYY-MM` (for example, `2026-09`). The server-side `billSchema` incorrectly required a full `YYYY-MM-DD` date, so validation rejected every normal edit before the tenant-scoped database update ran.

## Corrected behavior

- Accept the `YYYY-MM` value produced by the Billing month control.
- Continue to reject invalid month values such as month 13.
- Preserve the existing tenant-scoped homeowner and bill lookup/write behavior.
- Do not change Petty Cash, Payroll, receipt, payment, or other non-billing behavior.

## Verification outcome

- The production-reported values (September 2026, due September 15, amount PHP 1.00, penalty PHP 0.00, Unpaid) are covered by the regression test.
- The focused Billing suite passed (5 tests); the full local unit suite passed (444 tests), with lint and TypeScript also green.
- PR #176 implementation head `7d7eb1ce9e3b2edacd84aed2348e2401ea4195be` passed HOAHub MySQL CI #1150 and Canva Visual Parity #330.
- PR #176 merged to `main` at `230d3d09f268fd8aeb201898597ac0c08c6affe8`.
- Repository implementation and merge are complete. Hostinger production deployment and authenticated production UAT remain separate verification gates.
