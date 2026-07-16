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

---

# Sprint 5B Release Candidate - Finance Professionalization

Status: Engineering ready for Product Owner UAT.

- Improved SOA browser print and downloaded SOA PDF parity by aligning both outputs to the shared tenant-scoped statement service values.
- Replaced visible database-id-derived SOA statement/reference labels with public account, date, and resolution labels.
- Added a `View SOA` action in Top Delinquent Homeowners with a filtered-dashboard return path.
- Added Recent Finance Activity search, activity type/status/date filters, URL persistence, pagination, and clear empty states.
- Added controlled-date aging verification for Current, 30 Days, 60 Days, 90 Days, and 120+ buckets without temporary database records.
- Improved Finance Dashboard PDF and DOCX exports with key observations, internal-use footer text, and safer wrapped report tables.
- No database migration was required.

Release gate:
- Bug #049 and Improvements #056-#058 must not be marked complete until local Product Owner UAT passes.

---

# Sprint 6A Release Candidate - Homeowner Mobile Foundation

Status: Engineering ready for Product Owner UAT.

- Added a mobile-first homeowner application shell with tenant logo/name, homeowner greeting, profile action, safe-area-aware bottom navigation, and active-route accessibility.
- Added shared portal mobile components for summary cards, quick actions, section headers, empty/error/loading states, mobile list items, and responsive page containers.
- Rebuilt the homeowner dashboard foundation around existing authoritative data, including SOA-backed outstanding balance, available credit, last payment, next due date, quick actions, and previews for announcements, events, payment requests, and document requests.
- Added `/portal/soa` for homeowner-facing account statement review using the existing tenant-scoped SOA service.
- Filtered quick actions and navigation by tenant module entitlement.
- Tightened explicit tenant filters on homeowner portal reads for billing, payments, collections, documents, announcements, events, vehicles, HOA officers, and related document officer lookups.
- Added neutral HOAHub PWA manifest metadata without service-worker caching of authenticated financial data.
- No database migration was required.

Known limitations:
- Offline access, push notifications, and app-install polish beyond manifest metadata are deferred to Sprint 6B.
- Homeowner SOA PDF self-service remains deferred; the Sprint 6A route focuses on mobile screen review.
- Product Owner mobile UAT is required before release approval.

---

# Sprint 6A Release Candidate - Tenant Document Workflows

Status: Engineering ready for Product Owner UAT.

- Added additive document architecture migration for tenant document configurations, fields, household/family subjects, snapshots, fees, delivery modes, and admin edit audits.
- Added `/admin/settings/document-types` so tenants can enable or disable document types and configure fees, approval/payment rules, templates, signatories, copy limits, validity, and request fields.
- Updated homeowner document requests to support Self or registered household/family member subjects with server-side tenant/homeowner ownership validation.
- Stored immutable subject, request, configuration, template, delivery, fee, and reviewed-data snapshots.
- Preserved existing generated documents and retained legacy `GENERATED` status compatibility.
- Updated generated-document access checks to validate tenant ownership and block paid-document downloads until payment is confirmed.

Known limitations:
- Sprint 6A does not create accounting entries for paid documents. Fee/payment snapshots are stored and download remains blocked until Sprint 6B finance integration confirms payment.
- Bug #062 and Improvements #063-#066 remain pending until Product Owner UAT passes.

---

# Sprint 6A Hotfix - Document Platform Foundation

Status: Engineering ready for Product Owner UAT.

- Fixed document request availability so only complete tenant configurations with active linked same-tenant matching templates appear in homeowner request forms.
- Added admin completeness labels for document configurations.
- Added Date of Birth labeling and helper text for household/family members.
- Added homeowner and admin household-member editing while preserving immutable request/generated snapshots.
- Added a safe block-template schema foundation with allowlisted placeholders and QR verification placeholder support.

Known limitations:
- Custom tenant document types are not enabled in this hotfix because the current schema is still `DocumentType` enum-bound. An additive tenant catalog migration and backfill are required first.
- Draft/published visual template storage and the full editor route remain a dedicated follow-up sprint.
- Bug #074 and Improvements #075-#078 must not be marked complete until Product Owner UAT passes.

---

# Sprint 6A Hotfix - Document Review and Approval Writes

Status: Engineering ready for Product Owner UAT.

- Fixed document Save Preview, rejection, approval, and generation writes that failed when nested audit/history records used scalar `actorId` under tenant-scoped Prisma update calls.
- Moved review, approval/generation, edit audit, workflow history, document version, and audit log writes into base-client transactions after explicit tenant validation.
- Preserved reviewed snapshots, original request snapshots, generated document snapshots, template version snapshots, and document history.
- Added server-side authorization for outstanding-balance download overrides.

Known limitations:
- Bug #079 remains pending until Product Owner UAT confirms Save Preview, Approve and Generate, balance override, tenant isolation, and homeowner document regressions.

---

# Sprint 6B-1A - Document Definition Compatibility Schema

Status: Engineering complete locally; Product Owner UAT pending for later document-definition product workflows.

- Added additive schema for tenant-owned `DocumentDefinition`, definition fields, template sets, published template versions, definition counters, and verification tokens.
- Kept existing `DocumentType` enum fields for backward compatibility.
- Backfilled legacy configurations, fields, templates, requests, and generated document versions to new compatibility links without rewriting generated content or document numbers.
- Added compatibility resolver service for definition lookup by id or tenant/legacy type.
- Added a local verification harness for expected definition counts, link counts, tenant isolation, and historical fingerprints.

Known limitations:
- Custom document-definition administration, visual editor publishing workflow, completeness validation UI, document payments, release workflow, and public QR verification remain future Sprint 6B work.
- Improvements #081-#083 remain open until Product Owner UAT passes.

---

# Sprint 6B-1B - Document Definition Catalog and Template Publishing

Status: Engineering ready for Product Owner UAT.

- Added `/admin/settings/document-definitions` for tenant-owned document definition catalog management.
- Added create, edit, duplicate, activate, deactivate, archive, search, filter, sort, pagination, completeness status, and requestability status.
- Added server-side completeness validation for active/archive state, workflow, fees, numbering, assigned published template, tenant ownership, template JSON, placeholders, signatory, copies, validity, and QR configuration.
- Added definition dynamic-field configuration.
- Added template-set/version pages with draft creation, duplication, publish, retire, and version history.
- Added a structured A4 block editor with add/remove/reorder controls, placeholder selectors, safe preview, save draft, and publish.
- Updated homeowner document request creation to use complete active definition-backed options and snapshot definition/template-version data.
- Added document numbering format validation and a local harness.

Known limitations:
- Walk-in issuance, document fee collection, release acknowledgment, public QR verification, and legacy enum removal remain deferred.
- Fully custom enumless homeowner requests remain deferred because `DocumentRequest.type` is still required for legacy compatibility.
- Improvements #081-#083 remain open until Product Owner UAT passes.

# Sprint 6B-1B Hotfix - Document Definition Catalog Actions and Fields

Status: Engineering ready for Product Owner UAT.

- Fixed document definition Activate, Deactivate, and Archive actions by aligning submitted action values with the server-side allowlist.
- Preserved tenant validation and base-client update behavior for definition status changes.
- Replaced the raw dynamic-field JSON textarea with structured field-builder controls for add, edit, activate/deactivate, required fields, select options, default values, validation inputs, remove, and move up/down ordering.
- Added a visible `Document definitions` action to the System Settings Configuration Center.
- Preserved catalog focus after applying filters and paging by using the shared pagination focus target and URL hash.

Release gate:
- Bugs #084-#085 and Improvements #086-#087 remain open until Product Owner UAT passes.

# Sprint 6B-1B Final Hotfix - Dynamic Fields and Custom Requests

Status: Engineering ready for Product Owner UAT.

- Added migration `20260716174058_nullable_document_request_type` so custom definition-backed requests can persist with `DocumentRequest.type = null`.
- Preserved legacy enum values for existing and legacy-backed document requests.
- Added normalized dynamic field rendering and validation for default values, SELECT options, min/max, min/max length, pattern validation, and required checkboxes.
- Added server-side rejection for unknown dynamic fields and invalid SELECT/checkbox submissions.
- Added custom definition numbering through `DocumentDefinitionCounter` while preserving legacy `DocumentCounter`.
- Updated document labels across portal/admin/PDF/print/verification paths to prefer document definitions before legacy enum labels.
- Hardened Activate/Deactivate/Archive forms with exact hidden `operation` values and added a rollback verification harness.

Release gate:
- Bugs #084, #088, and #089 remain open until Product Owner UAT passes.
