# PR #138 — Rental Management MVP

Release candidate for tenant-scoped rental operations in HOAHub.

## Scope

- Rentable asset inventory for stalls, parking, spaces, and other assets.
- Standalone renters with optional same-tenant homeowner linkage; no fake User/Homeowner records for outsiders.
- Rental agreements with term, monthly rate, billing/due days, and refundable security deposit.
- Monthly rental invoices with OPEN, PARTIAL, PAID, OVERDUE, and VOID lifecycle.
- RentalPaymentAllocation reconciles existing Collection receipts to rental invoices without creating duplicate cash entries.
- Admin rental workspace for assets, renters, agreements, invoice generation, outstanding/overdue monitoring, and payment allocation.
- Finance export distinguishes rental income from refundable rental security-deposit liabilities.

## Release invariants

- Collection is the authoritative cash and receipt ledger.
- Only eligible non-refundable CollectionType.OTHER receipts can be allocated.
- Tenant mismatch, invoice overpayment, receipt over-allocation, and incompatible payer ownership fail closed.
- Security deposits are liabilities, never rental income.
- Rental finance writes retain existing BILLING_MANAGE authority for this MVP.
- Rental SQL access is explicitly tenant-scoped; concurrency-sensitive state changes use serializable transactions.
- Monthly invoice generation is idempotent per tenant, agreement, charge type, and billing period.

## Verification gate

Merge only after the exact final head passes HOAHub MySQL CI and HOAHub Canva Visual Parity. Production completion requires the merged Hostinger release marker to match the merge SHA prefix and /api/health to succeed.
