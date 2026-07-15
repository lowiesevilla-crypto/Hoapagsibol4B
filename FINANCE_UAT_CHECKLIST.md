# HOAHub Finance End-to-End UAT Checklist

**Product:** HOAHub  
**Module:** Finance  
**Version:** 1.0  
**Tester:** Lowie M. Sevilla  
**Environment:** Local Development  
**Branch:** feature/soa-final  
**Status:** In Progress  

---

# 1. Purpose

This document records the final end-to-end User Acceptance Testing for the HOAHub Finance Engine.

The Finance module is approved for release only when all critical test cases pass.

---

# 2. Test Rules

- Use test tenants and test homeowners.
- Do not modify production data.
- Record every PASS or FAIL.
- Capture the exact error message for every failure.
- Do not merge into `develop` or `main` while a critical item remains open.
- Verify tenant isolation after every major workflow.
- Verify mobile layout for all user-facing finance pages.

---

# 3. Environment Validation

| Test Case | Expected Result | Status | Remarks |
|---|---|---|---|
| Correct Git branch | `feature/soa-final` |  |  |
| Git working tree | Clean |  |  |
| Prisma migrate status | Database schema is up to date |  |  |
| Prisma validate | Pass |  |  |
| Prisma generate | Pass |  |  |
| Typecheck | Pass |  |  |
| Clean build | Pass |  |  |

---

# 4. Billing Rules

| Test Case | Expected Result | Status | Remarks |
|---|---|---|---|
| Create Billing Rule | Rule saves successfully |  |  |
| Edit Billing Rule | All fields populate and persist |  |  |
| Resolution Reference | Displays and saves correctly |  |  |
| Effective Start | Correct month and year |  |  |
| Effective End | Correct month and year |  |  |
| Open Ended Rule | Both end fields remain blank |  |  |
| Duplicate or overlapping rule | Clear validation message |  |  |
| Deactivate Rule | Rule becomes inactive |  |  |
| Tenant isolation | Other tenant cannot see rule |  |  |

---

# 5. Billing Exemptions

| Test Case | Expected Result | Status | Remarks |
|---|---|---|---|
| Create Exemption | Saves successfully |  |  |
| Effective Period | Correct start and end |  |  |
| Exemption Reason | Saved correctly |  |  |
| Approval Reference | Saved correctly |  |  |
| Deactivate Exemption | Exemption becomes inactive |  |
## Phase 3 Result – Payments and Receipts

Status: CONDITIONAL PASS

Passed:
- Exact payment
- Partial payment
- Multi-bill payment
- Overpayment
- One payment header
- One receipt per transaction
- Receipt preview
- Tenant branding
- Property/account details
- Processor identity
- Registered Receipts
- Active Payments
- Transaction History
- SOA update
- Homeowner credit
- Reference validation
- Tenant isolation
- Mobile

Open Issue:
- SOA browser Print Preview and downloaded PDF are not visually consistent

Decision:
Proceed to Phase 4 Void and Reversal UAT, but do not approve the Finance release until Bug #049 is resolved.
## Phase 4 Result – Void and Reversal

Status: PASS

Validated:
- Void action and confirmation
- Original receipt preserved
- Receipt marked Void
- Active Payments excludes voided payment
- Transaction History shows voided transaction
- All allocations reversed
- Bill balances restored
- Bill statuses recalculated
- Unapplied credit reversed
- Homeowner balance corrected
- SOA outstanding balance corrected
- SOA payment history updated
- SOA running ledger updated
- Reports exclude voided collection
- External reference reusable
- Tenant isolation
- No console errors

Open Improvements:
- Search and pagination for Active Payments
- Search and pagination for Transaction History
- Search and pagination for Payment Requests

---

# Phase 5A - Executive Finance Dashboard Product Owner UAT

Status: PENDING PRODUCT OWNER UAT

| # | Test Case | Expected Result | Status | Remarks |
|---|---|---|---|---|
| 1 | Branch and baseline | UAT is performed from `feature/finance-dashboard` with no unintended schema migration |  |  |
| 2 | Two-tenant sessions | Test HOA and Pagsibol can be opened in separate authenticated sessions |  |  |
| 3 | Role access | SYSTEM_ADMIN, HOA_ADMIN, BILLING_MANAGER, and currently authorized finance/admin roles can open the dashboard |  |  |
| 4 | Restricted access | Unauthorized, payroll-only, and platform-console-only access is denied; no payroll data appears |  |  |
| 5 | Module entitlements | A tenant without required Billing or Reports entitlement is denied according to current SUPER_ADMIN bypass rules |  |  |
| 6 | Default period | Start is January 1 of the current year and end is the current date |  |  |
| 7 | Invalid period | Start after end shows the precise validation message and does not run the report |  |  |
| 8 | Apply and Reset | Apply preserves `from` and `to` in the URL; Reset restores the default period |  |  |
| 9 | Ten KPIs | Every KPI agrees with tenant source records for the selected period/as-of end date |  |  |
| 10 | Header counting | Multi-bill payments count once in active/voided receipt counts and collection totals |  |  |
| 11 | Reconciliation | Active received equals applied plus credit; any variance above PHP 0.01 is visibly warned |  |  |
| 12 | Monthly trend | Active, applied, credit, and voided values agree with the fallback table and include zero months |  |  |
| 13 | Receivables aging | Amount and bill count agree with SOA aging as of the selected end date |  |  |
| 14 | Payment methods | Active-only transaction count, amount, and percentage agree with Payment headers |  |  |
| 15 | Billing types | Billed, applied, and outstanding agree by type; refundable bonds are excluded from revenue |  |  |
| 16 | Delinquency | Highest balance sorts first; search, pagination, public account, SOA link, and no internal IDs are correct |  |  |
| 17 | Recent activity | Billing, payment, void, credit, and payment-request entries show correct actor, reference, amount, and status |  |  |
| 18 | PDF and DOCX | Both exports match the screen/date range and each other, include required branding/sign-off data, and expose no internal IDs |  |  |
| 19 | Tenant isolation | Test HOA changes never affect Pagsibol and Pagsibol changes never affect Test HOA |  |  |
| 20 | Finance regression | Billing rules/exemptions/preview/generation, exact/partial/multi/overpayment, one receipt, active/history/register, SOA, and void remain correct |  |  |
| 21 | Responsive and console | Desktop and approximately 390px mobile have no root horizontal overflow, hydration error, or console error |  |  |
| 22 | Product Owner decision | Product Owner records approval before release status or applicable Improvement #053-#055 status changes |  |  |
