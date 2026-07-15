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
