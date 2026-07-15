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

## Finance Receipt, History, and Void Finalization

### Completed

- [x] Bug #035: resolve receipt organization data from the persisted Payment tenant and prevent default-tenant branding leakage.
- [x] Bug #036: show public account, block, lot, and property address without CUID/UUID values.
- [x] Bug #037: print the persisted human processor name with role or position shown separately.
- [x] Bug #038: block active duplicate references while permitting tenant-scoped reuse after void for GCash and Bank Transfer.
- [x] Bug #039: query and paginate Transaction History as one row per Payment header with receipt-first references.
- [x] Bug #040: preserve allocations and receipts while reversing bill balances, active credit, SOA totals, and ledger effect atomically.
- [x] Bug #041: use one tenant-safe receipt view model for preview and PDF business values.
- [x] Verify receipt register, Active/Void status, SOA and receipt PDF endpoints, desktop/mobile UI, tenant isolation, and payment regressions.
- [x] Keep Prisma schema and migrations unchanged.

## Sprint 5A - Executive Finance Dashboard

### Engineering Complete

- [x] Add `/admin/reports/dashboard` and Finance Dashboard navigation.
- [x] Enforce authenticated tenant, approved finance/admin role, and module entitlements.
- [x] Centralize dashboard and export calculations in `lib/services/finance-dashboard.ts`.
- [x] Apply one validated, URL-persisted date range to KPIs, charts, tables, PDF, and DOCX.
- [x] Prevent allocation joins from duplicating Payment-header collection totals and receipt counts.
- [x] Reconcile active payment receipts to applied allocations plus derived homeowner credit with PHP 0.01 tolerance.
- [x] Reuse the authoritative SOA aging bucket classifier and selected end-date as-of rules.
- [x] Exclude refundable bonds from revenue while retaining supported non-refundable collections.
- [x] Add accessible table fallbacks, empty/error states, delinquency search/pagination, and 390px mobile containment.
- [x] Add PDF and DOCX exports with matching values, tenant branding, sign-off fields, and supported page numbering.
- [x] Keep Prisma schema and migrations unchanged.

### Release Gate

- [ ] Complete two-tenant Product Owner UAT in `FINANCE_UAT_CHECKLIST.md`.
- [ ] Obtain Product Owner approval before changing any applicable Improvement #053-#055 status or merging for release.

## Sprint 5B - Finance Professionalization

### Engineering Scope

- [x] Align SOA browser print and downloaded SOA PDF business content through the shared tenant-scoped statement service.
- [x] Replace visible SOA database-id-derived statement/reference labels with public account/date/resolution labels.
- [x] Add explicit `View SOA` actions from Top Delinquent Homeowners while preserving dashboard return filters.
- [x] Add Recent Finance Activity search, type/status/date filters, URL persistence, page controls, and empty states.
- [x] Verify aging bucket behavior with controlled sample dates and the shared receivables classifier.
- [x] Improve Finance Dashboard PDF/DOCX exports with report observations, internal-use footer text, and safer wrapped tables.
- [x] Keep Prisma schema and migrations unchanged.

### Release Gate

- [ ] Complete local Product Owner UAT for Bug #049 and Improvements #056-#058.
- [ ] Verify SOA print/PDF parity, Finance Dashboard PDF/DOCX parity, tenant isolation, RBAC, and 390px mobile behavior before release approval.
- [ ] Do not mark Bug #049 or Improvements #056-#058 complete until Product Owner UAT passes.

## Sprint 6A - Homeowner Mobile Foundation

### Engineering Scope

- [x] Add a homeowner mobile shell with tenant branding, greeting, profile action, entitlement-aware notification access, bottom navigation, and safe-area padding.
- [x] Preserve desktop/tablet compatibility by keeping the existing sidebar on large screens.
- [x] Create reusable portal mobile components for summary cards, quick-action tiles, section headers, empty/error/loading states, mobile list rows, and responsive page containers.
- [x] Rebuild the homeowner dashboard foundation using existing tenant-safe services and bounded read queries.
- [x] Add `/portal/soa` as the homeowner statement route backed by the shared SOA view model.
- [x] Gate quick actions and navigation by module entitlement.
- [x] Add neutral PWA manifest metadata without offline caching of private tenant or homeowner financial data.
- [x] Keep Prisma schema, migrations, finance calculations, payment logic, receipt logic, and SOA calculations unchanged.

### Release Gate

- [ ] Complete Product Owner UAT at 360px, 390px, 430px, tablet, and desktop widths.
- [ ] Verify homeowner login, dashboard, profile, pay, SOA, receipts, documents, announcements, events, chat, tenant branding, tenant isolation, and admin/finance regressions.
- [ ] Defer deeper native/offline behavior, richer push notifications, and full feature redesigns to Sprint 6B.
