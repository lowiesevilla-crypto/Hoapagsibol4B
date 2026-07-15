# HOAHub Release Notes
## Version 1.2.0
**Release Type:** Development Milestone  
**Status:** Internal Release Candidate  
**Release Date:** July 11, 2026

---

# Overview

Version 1.2.0 represents a major milestone in the Finance Module of HOAHub.

This release introduces the Billing Rules Engine and the first version of the Billing Generation Engine, providing tenant-specific billing configuration, billing generation, duplicate prevention, billing exemptions, and improved Statement of Account functionality.

This version is intended for development and internal User Acceptance Testing (UAT). It is **not yet recommended for production deployment**.

---

## One Payment / One Receipt Finance Hotfix

### Completed

- Added `PaymentAllocation` for tenant-safe bill-level allocation under one Payment transaction header.
- Added local migration `20260712150000_payment_allocations_single_receipt` with one-for-one legacy allocation backfill.
- Preserved all historical Payment IDs, amounts, batches, and receipt numbers without consolidating legacy duplicates.
- Generated one tenant receipt number once per payment transaction.
- Added tenant-scoped idempotency for retry and concurrent-submit safety.
- Redirected successful Record Payment submissions to the persisted receipt preview.
- Added multi-line browser/PDF receipt coverage, allocation total, property/account, remaining balance, collector, and return actions.
- Updated payment editing and voiding to recalculate all covered bills atomically.
- Updated receipt register, Active Payments, Transaction History, homeowner history, SOA, and reports to count each Payment once.

### Local Verification

- Migration preserved 12 Payments and backfilled 12 valid allocations.
- Payment recording: PASS 38 checks.
- Payment edit/void lifecycle: PASS 9 checks.
- Tenant isolation: PASS 22 checks.
- Desktop/mobile receipt, refresh safety, PDF response, RBAC, and temporary-data cleanup passed.

---

# Major Features Delivered

## Statement of Account (Sprint 2.1)

### Completed

- Professional Statement of Account
- Billing History
- Payment History
- Running Ledger
- Outstanding Balance Summary
- PDF Export
- Mobile Responsive Layout
- Homeowner Information
- Financial Summary
- Printable SOA
- Tenant Branding Support

### Improvements

- Improved PDF formatting
- Improved layout spacing
- Improved ledger presentation
- Mobile optimization
- Final Print SOA activation with mouse, Enter, and Space support
- Final one-page PDF layout for short statements
- Refined signature and footer placement

---

## Billing Rules Engine (Sprint 2.2)

### New Features

- Tenant-specific Billing Rules
- Resolution-based Billing
- Effective Start Period
- Effective End Period
- Manual Billing Generation Preference
- Automatic Billing Configuration (Future Ready)
- Penalty Configuration
- Billing Rule History
- Billing Rule Activation / Deactivation
- Billing Exemptions
- Resolution Reference
- Multi-Tenant Isolation

### Validation

- Duplicate Rule Prevention
- Effective Period Validation
- End Period Validation
- Resolution Date Support
- Notes Support

---

## Billing Generation Engine (Sprint 2.3)

### New Features

- Billing Preview
- Generate Billing for All Eligible Homeowners
- Duplicate Billing Prevention
- Billing Rule Integration
- Billing Exemption Integration
- Coverage Month / Year
- Billing Summary
- Mobile Responsive Interface

### Generation Logic

- Tenant Scoped
- Duplicate Detection
- Exemption Detection
- Billing Rule Resolution
- Coverage Tracking
- Audit Ready

---

# Security Improvements

- Tenant Isolation
- Finance Role Protection
- Billing Rule Access Control
- Billing Generation Authorization
- Duplicate Prevention
- Improved Validation

---

# Performance Improvements

- Faster Billing Preview
- Improved Billing Queries
- Improved Mobile Layout
- Better Finance Navigation Foundation

---

# Known Issues

Resolved before this release candidate:

- Individual Billing Generation
- Resolution Reference in Billing Preview
- Payment Synchronization
- Billing Balance Synchronization
- Payment Search Improvements
- Billing Preview Search
- Finance Navigation Improvements
- Exemption Summary Counter
- SOA Print button activation
- SOA short-PDF unnecessary second page
- SOA browser print pagination and horizontal overflow

---

# Upcoming Sprint

## Finance Finalization Hotfix

- Corrected tenant-scoped receipt branding and eliminated cross-tenant bootstrap logo fallback.
- Added public property/account presentation and stable processor identity to receipt preview and PDF data.
- Added one-row-per-Payment Transaction History with Official Receipt, received/applied/credit totals, status, processor, and allocation details.
- Allowed tenant-scoped GCash and Bank Transfer reference reuse after the prior transaction is voided while retaining active duplicate protection.
- Completed payment void reversal across covered bills, active unapplied credit, SOA totals, receipt status, and running-ledger reversal entries.
- Preserved all historical Payment, allocation, receipt, and audit records.
- Verified receipt/SOA PDF routes, desktop and 390px mobile UI, payment regressions, and tenant isolation without a schema migration.

## Post-RC UAT

Planned Deliverables

- Product-owner UAT
- Merge review into `develop`
- Production release preparation from `main`

---

# Current Product Status

| Module | Status |
|----------|--------|
| Authentication | ✅ Complete |
| Multi-Tenant | ✅ Complete |
| HOA Branding | ✅ Complete |
| Homeowners | ✅ Stable |
| Billing Rules | ✅ Complete |
| Billing Generation | ✅ Core Complete |
| Statement of Account | ✅ Complete |
| Official Receipts | ✅ Stable |
| Payments | ✅ Finance Workflow Complete |
| Reports | 🚧 In Progress |
| Documents | 🚧 In Progress |
| HRIS | 📅 Planned |
| AI Assistant | 📅 Planned |

---

# Developer Notes

This version successfully completes the core architecture required for HOAHub's Finance Engine.

Future work will focus on completing end-to-end finance integration before moving into HRIS, AI-powered Community Assistant, and advanced analytics.

---

# Release Approval

Status:

✅ Development Complete

✅ Internal Testing Complete

✅ Finance Integration Hotfix Complete

✅ SOA Finalization Complete

❌ Not Yet Approved for Production

---

HOAHub Development Team

Version 1.2.0

---

# Sprint 5A Release Candidate - Executive Finance Dashboard

Status: Engineering complete; Product Owner UAT pending.

- Added a tenant-scoped Finance Dashboard under Reports with ten executive KPIs and one shared date range.
- Added visible cash-to-allocation reconciliation with derived homeowner credit and PHP 0.01 variance tolerance.
- Added monthly collection, aging, payment-method, and billing-type visualizations with accessible table fallbacks.
- Added searchable and paginated top delinquent homeowners plus bounded recent finance activity.
- Added matching PDF and DOCX exports with tenant branding, report metadata, sign-off fields, and supported page numbering.
- Enforced finance/admin RBAC and Billing/Reports entitlements without exposing payroll data or accepting client tenant IDs.
- Reused SOA aging rules, excluded refundable bonds from revenue, and avoided PaymentAllocation join double-counting.
- No database migration was required.

Known limitations:
- Collection rate may exceed 100% when current-period receipts settle earlier-period bills.
- Unapplied credit is reported as a derived liability; applying it to future bills is a separate workflow.
- DOCX pagination is finalized by the document viewer; local visual rendering was unavailable without LibreOffice.
- Product Owner two-tenant UAT is required before release approval or any applicable Improvement #053-#055 status change.
