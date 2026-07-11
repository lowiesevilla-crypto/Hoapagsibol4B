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
- [x] Signature lines and generated footer flow on the true final page.
- [x] SOA print CSS hides action UI and allows tables to paginate without horizontal overflow.
- [x] Prisma schema and migrations unchanged.
- [x] Finance calculations, receipt logic, authentication, RBAC, and tenant routing unchanged.
- [x] Required local quality gates passed.

### Next Milestone

Prepare SOA finalization for review and merge after product-owner UAT.
