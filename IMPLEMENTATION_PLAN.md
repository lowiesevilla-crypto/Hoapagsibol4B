# Current Development Status

## Sprint 2.3 – Billing Generation and Finance Integration

### Status

✅ Completed and merged into develop

### Delivered

- Billing Rules
- Billing Exemptions
- Billing Preview
- Bulk Billing Generation
- Individual Billing Generation
- Selected Homeowner Generation
- Duplicate Prevention
- Resolution Reference Integration
- Balance Synchronization
- Payment Synchronization
- Dedicated Payment Routes
- Searchable Record Payment
- Tenant Isolation
- Mobile Finance Workflow

## SOA Finalization

### Status

✅ Completed on `feature/soa-final`

### Completed

- Statement of Account screen
- Billing History
- Payment History
- Running Ledger
- Aging Summary
- PDF Export
- Browser Print SOA action
- One-page short SOA PDF layout
- Final signature/footer placement
- Mobile Layout
- Tenant-scoped access
- RBAC validation

### Final Release Blockers

- [x] Bug #028: Print SOA opens through a dedicated client button with mouse, Enter, and Space activation.
- [x] Bug #029: Short SOA PDF sample with 1 ledger row, 0 payment rows, and 1 billing row renders as exactly one A4 page.
- [x] Bug #030: Browser Print SOA no longer creates blank/mostly blank carryover pages or horizontal overflow for the verified homeowner SOA.
- [x] Signature lines and generated footer flow on the true final page.
- [x] SOA print CSS hides action UI and allows tables to paginate without horizontal overflow.
- [x] Prisma schema and migrations unchanged.
- [x] Finance calculations, receipt logic, authentication, RBAC, and tenant routing unchanged.
- [x] Required local quality gates passed.

### Next Milestone

## Urgent Finance Migration and Hotfix

### Completed

- [x] Bug #031: one Payment header and one receipt number per payment transaction.
- [x] Improvement #032: successful Record Payment redirects to the persisted receipt preview.
- [x] Added tenant-safe PaymentAllocation rows with positive per-bill amounts.
- [x] Applied `20260712150000_payment_allocations_single_receipt` to the local development database only.
- [x] Backfilled one allocation per legacy Payment without merging or renumbering historical receipts.
- [x] Added tenant-scoped idempotency handling for Record Payment retries and concurrent duplicate submissions.
- [x] Updated allocation-aware balance recalculation, amount editing, transaction voiding, receipts, SOA, payment history, and reports.
- [x] Verified desktop, mobile, tenant isolation, RBAC, receipt PDF, edit, void, and cleanup behavior.

### Next Milestone

Prepare the finance migration and SOA finalization for product-owner review before merge to `develop`.

## Payment Tenant Validation and Overpayment Credit Hotfix

### Completed

- [x] Bug #033: allow same-tenant PaymentAllocation creation after its Payment header is created in the same interactive transaction.
- [x] Preserve composite database foreign-key enforcement and server-side mismatch diagnostics for cross-tenant IDs.
- [x] Improvement #034: represent unapplied credit as Payment amount received minus active allocation total.
- [x] Cap bill allocations at each outstanding balance and preserve the remainder as homeowner credit.
- [x] Support overpayment through direct recording, payment-request approval, controlled edits, and transaction voiding.
- [x] Show received, applied, unapplied credit, and aggregate homeowner credit on receipts, SOA, portal/admin views, and reports.
- [x] Keep unapplied credit out of dues income while retaining the full payment in cash receipts.
- [x] Verify desktop/mobile UI, transaction lifecycle, tenant isolation, typecheck, and cleanup.
- [x] Leave future credit application as a separate authorized workflow.
