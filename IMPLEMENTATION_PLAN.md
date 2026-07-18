# Current Development Status

## Document Module Architecture Consolidation - Phase 1

### Authoritative Architecture

- `DocumentDefinition` is the tenant-owned root for document type, workflow, fee, visibility, balance policy, numbering, signatory, and assigned published template.
- `DocumentDefinitionField` stores tenant-owned required information for request forms.
- `DocumentTemplateSet` and `DocumentTemplateVersion` store draft, published, and retired template versions.
- `DocumentRequest` stores immutable definition, workflow, subject, request data, template, and generated-content snapshots.
- `DocumentVerificationToken`, `DocumentDefinitionCounter`, and `DocumentCounter` remain the verification and numbering foundations.
- Legacy `DocumentTypeConfiguration` and `DocumentTemplate` remain compatibility data only and must not be the ordinary administrator-facing configuration system.

### Target Lifecycle

Document Type Configuration
->
Template Draft
->
Template Publication
->
Homeowner, Household Member, or Walk-In Request
->
Document Fee Payment when required
->
Approval when required
->
Generation using an immutable template snapshot
->
Download or Office Release
->
Receipt and Release Acknowledgement
->
Verification and Audit History

### Phase 1 Delivered

- `/admin/documents` is the single Document Management entry point with Document Types, Templates, Requests, and Issued Documents sections.
- `/admin/document-templates` redirects to the consolidated Templates section with an informational notice; legacy code is retained for rollback/reference.
- The sidebar exposes Document Management instead of separate legacy template and definition links.
- Document Types show status, homeowner visibility, workflow, fee, balance policy, active published template, completeness, requestability, and actions.
- Templates are presented as Current Published Template, Current Draft, and Version History.
- Homeowner catalog requestability is backed by the same completeness and visibility rules exposed to administrators.
- Bug #098 policy resolution uses the saved live definition policy and falls back to the request definition snapshot before defaulting to `BLOCK_DOWNLOAD`.

### Phase 2 Scope

- Add an authorized tenant-safe seed/repair workflow for missing custom definitions such as Certificate of Indigency, Move-In Pass, and Move-Out Pass.
- Move admin walk-in generation from legacy configurations to DocumentDefinition when the generation path is fully verified.
- Replace legacy print/PDF branching with the deterministic template renderer where compatible.
- Add public QR verification tokens and verification page when the verification model is ready.
- Add release acknowledgement, document-fee accounting, and receipt integration in a dedicated sprint.

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

## Sprint 6A - Document Architecture Migration

### Engineering Scope

- [x] Add tenant-scoped household/family members with composite homeowner ownership.
- [x] Add tenant document type configurations, field configurations, delivery modes, fees, templates, signatories, validity, and copy limits.
- [x] Add immutable request subject/configuration/template/data snapshots.
- [x] Add admin-reviewed data snapshots and field-level edit audits.
- [x] Add active tenant document catalog page at `/admin/settings/document-types`.
- [x] Update homeowner document request flow for Self or registered household/family member subjects.
- [x] Validate household member ownership and tenant membership server-side.
- [x] Preserve legacy request compatibility and keep generated document snapshots immutable.
- [x] Implement payment status/fee snapshots only; defer accounting collection integration.

### Release Gate

- [ ] Complete Product Owner UAT for Bug #062 and Improvements #063-#066.
- [ ] Verify free instant download, paid download blocking, approval-only, paid-and-approved blocking, request-only, tenant-specific configuration differences, admin edit audit, and mobile workflow.
- [ ] Do not mark Bug #062 or Improvements #063-#066 complete until Product Owner UAT passes.

## Sprint 6A - Document Platform Hotfix and Foundation

### Engineering Scope

- [x] Centralize document configuration availability and use it for homeowner request catalog filtering.
- [x] Treat missing `templateId`, inactive templates, mismatched tenant/type, and inactive configurations as incomplete.
- [x] Keep template assignment same-tenant and same-type only.
- [x] Label household `birthDate` as Date of Birth with helper text.
- [x] Allow homeowner and admin editing of scoped household-member fields without changing tenantId/homeownerId or historical snapshots.
- [x] Add allowlisted visual-template block schema foundation.
- [x] Document why custom tenant document types require an additive catalog migration before implementation.

### Release Gate

- [ ] Product Owner UAT for Bug #074 and Improvements #075-#078.
- [ ] Next migration sprint must add tenant document catalog records, template draft/published version storage, and compatibility backfill before custom document types or full visual editing are enabled.

## Sprint 6A - Document Review and Approval Hotfix

### Engineering Scope

- [x] Confirm generated Prisma API for `DocumentRequestEditAudit` and `DocumentRequestHistory` actor fields.
- [x] Keep tenant-scoped request loading and explicit tenant ownership checks before mutation.
- [x] Replace nested audit/history creates inside `documentRequest.update()` with base-client transactional child writes.
- [x] Preserve reviewed data snapshots, field-level edit audits, request histories, document version snapshots, generated content snapshots, and audit logs.
- [x] Keep approval/generation document-number allocation inside the same transaction.
- [x] Require an authorized role and reason for outstanding-balance download override.
- [x] Verify the write shape with a rollback harness that leaves no temporary records.

### Release Gate

- [ ] Product Owner UAT for Bug #079.
- [ ] Verify Save Preview, Approve and Generate, rejection, balance override, tenant isolation, and homeowner document regressions.
- [ ] Do not mark Bug #079 complete until Product Owner UAT passes.
## Sprint 6B-1 – Enterprise Document Definition Platform

### Objective

Transform HOAHub Documents into a fully configurable tenant-owned platform.

### Phase 1 – Architecture Review

- Review enum-based DocumentType usage.
- Identify required relations and compatibility risks.
- Propose additive DocumentDefinition architecture.
- Preserve all existing requests, configurations, templates, versions, and generated documents.

### Phase 2 – Document Definition Catalog

- Create
- Edit
- Duplicate
- Activate
- Deactivate
- Archive
- Search
- Filter
- Sort
- Pagination

### Phase 3 – Workflow and Field Configuration

- Free + Instant
- Free + Approval
- Paid + Instant
- Paid + Approval
- Request Only
- Required and optional dynamic fields
- Fee and payment rules
- Approval and release rules

### Phase 4 – Template Platform

- JSON-backed versioned template definition
- A4 preview
- Safe component library
- Placeholder library
- Draft and publish workflow
- Deterministic rendering

### Phase 5 – Completeness and Security

- Completeness validation
- Tenant isolation
- RBAC
- Audit trail
- Immutable issued-document snapshots
- Performance and indexing

### Exit Criteria

Sprint 6B-1 may be approved only after Product Owner UAT confirms that a tenant can create and publish a custom document definition without code deployment.
## Sprint 6B-1A – Document Definition Schema Migration

### Objective

Introduce the additive database foundation required for tenant-created documents, versioned templates, definition-specific numbering, and secure QR verification.

### Scope

- Add `DocumentDefinition`
- Add `DocumentDefinitionField`
- Add `DocumentTemplateSet`
- Add `DocumentTemplateVersion`
- Add `DocumentDefinitionCounter`
- Add `DocumentVerificationToken`
- Add nullable compatibility links to existing document models
- Backfill system definitions for all existing tenants and legacy document types
- Preserve legacy enum fields
- Verify no historical data changes

### Excluded

- Visual template editor UI
- Walk-in document issuance
- Document payment integration
- Release acknowledgment
- Full QR verification UI
- Removal of the legacy enum

### Implementation Status

- [x] Added additive migration `20260716120000_document_definition_compatibility_schema`.
- [x] Added tenant-owned definition, field, template set/version, counter, and verification token models.
- [x] Added nullable compatibility links to legacy configurations, fields, templates, requests, and generated document versions.
- [x] Backfilled 32 tenant/legacy-type definitions, 132 fields, 9 template sets, 9 published versions, 2 request links, and 1 generated-version link in local development.
- [x] Added `lib/services/document-definitions.ts` compatibility resolvers.
- [x] Added `scripts/verify-document-definition-migration.ts` local verification harness.
- [ ] Keep Improvements #081-#083 open until Product Owner UAT validates custom definition management, versioned templates, and requestability validation.

## Sprint 6B-1B – Document Definition Catalog and Template Publishing

### Implementation Status

- [x] Added `/admin/settings/document-definitions` catalog with create, edit, duplicate, activate, deactivate, archive, search, filter, sort, pagination, completeness, requestability, workflow, fee, numbering, signatory, visibility, and dynamic field configuration.
- [x] Added `/admin/settings/document-definitions/[id]/templates` for template-set/version history, draft creation, duplication, publishing, and retiring.
- [x] Added `/admin/settings/document-definitions/[id]/templates/[versionId]/edit` structured block editor with A4 preview, block add/remove/reorder, placeholder selection, draft save, and publish.
- [x] Added authoritative completeness and numbering validation services.
- [x] Updated homeowner document requests to prefer complete active definition-backed request options.
- [x] Preserved legacy enum/configuration compatibility for historical requests and generated documents.
- [ ] Keep Improvements #081-#083 open until Product Owner UAT passes.

### Known Limitation

`DocumentRequest.type` is now nullable for custom definition-backed requests. Legacy enum values remain in place for historical and legacy-backed requests until a later cleanup removes enum dependencies from older paths.

## Sprint 6B-1B Hotfix – Catalog Actions and Field Builder

### Implementation Status

- [x] Normalize document definition catalog status actions to the explicit `ACTIVATE`, `DEACTIVATE`, and `ARCHIVE` allowlist.
- [x] Keep tenant validation before status writes and update definitions by `id` only through the base Prisma client.
- [x] Prevent archived definitions from being activated or deactivated without a future explicit restore workflow.
- [x] Replace the raw dynamic-field JSON editor with structured add/edit/remove/reorder controls, required/active flags, select options, default values, and safe validation fields.
- [x] Add `Document definitions` navigation from the System Settings Configuration Center.
- [x] Preserve catalog table focus after filters and pagination using the shared pagination focus target.
- [ ] Keep Bugs #084-#085 and Improvements #086-#087 open until Product Owner UAT passes.

## Sprint 6B-1B Final Hotfix – Dynamic Rendering and Enumless Requests

### Implementation Status

- [x] Made `DocumentRequest.type` nullable through additive migration `20260716174058_nullable_document_request_type`.
- [x] Preserved existing legacy `DocumentType` values and historical generated-document snapshots.
- [x] Added normalized dynamic field view model and server-side validator for defaults, constraints, select allowlists, patterns, and required checkboxes.
- [x] Updated homeowner rendering to use normalized field defaults, options, and validation constraints.
- [x] Enabled custom definition-backed request creation with `definitionId` authoritative and `type = null` when no legacy type exists.
- [x] Added definition-scoped numbering through `DocumentDefinitionCounter` for custom definitions.
- [x] Updated document labels in admin, portal, print, PDF, and verification surfaces to prefer definition/configuration names before legacy enum labels.
- [x] Hardened definition action forms to submit hidden exact `ACTIVATE`, `DEACTIVATE`, and `ARCHIVE` values.
- [x] Added rollback verification harness for exact action values and nullable custom request persistence.
- [ ] Keep Bugs #084, #088, and #089 open until Product Owner UAT passes.

## Sprint 6B-1B Final Validation Hotfix – Field Constraints and Purpose Handling

### Implementation Status

- [x] Added shared document dynamic-field validation for normalized request rendering, workflow parsing, and local verification.
- [x] Enforced NUMBER/MONEY minimum and maximum constraints server-side.
- [x] Enforced TEXT/TEXTAREA minimum length, maximum length, and safe pattern validation server-side.
- [x] Preserved SELECT options as usable `{ label, value }` pairs after field-builder save/refresh.
- [x] Rejected empty required SELECT values and invalid SELECT values outside the configured allowlist.
- [x] Removed hidden legacy purpose enforcement from custom definition-backed requests without a purpose field.
- [x] Preserved legacy purpose behavior for enum/configuration-backed requests.
- [x] Added `scripts/verify-document-field-validation-hotfix.ts`.
- [ ] Keep Bugs #091-#093 open until Product Owner UAT passes.

## Document Workflow Configuration Hotfix – Bug #096

### Implementation Status

- [x] Made the business workflow preset authoritative for payment, approval, timing, immediate-download, and admin-review flags.
- [x] Disabled and zeroed Fee Amount for Free + Instant, Free + Approval, and Request Only.
- [x] Required positive Fee Amount for Paid + Instant and Paid + Approval.
- [x] Added workflow-specific explanation text in the Document Definition edit UI.
- [x] Added server-side rejection for invalid workflow strings and paid workflows without a positive fee.
- [x] Added completeness validation for workflow/fee and workflow/flag mismatches.
- [x] Preserved Request Only as manual `SUBMITTED` status preparation.
- [x] Added `scripts/verify-document-workflow-preset-hotfix.ts`.
- [ ] Keep Bug #096 open until Product Owner UAT passes.

## Document Definition Persistence Hotfix – Bug #097

### Implementation Status

- [x] Kept `/admin/settings/document-definitions` reads authoritative to `DocumentDefinition`.
- [x] Reconstructed workflow dropdown values from persisted `deliveryMode`.
- [x] Added explicit hidden/checkbox boolean serialization for editable definition booleans.
- [x] Parsed definition booleans server-side with `FormData.getAll()` so unchecked values persist.
- [x] Redirected saves back to `?edit=<definitionId>` and revalidated admin and portal document paths.
- [x] Added persisted configuration summary panel from saved database values.
- [x] Synchronized legacy `DocumentTypeConfiguration` compatibility fields only when `legacyType` exists.
- [x] Preserved assigned template and dynamic field records during definition edits.
- [x] Added `scripts/verify-document-definition-persistence-hotfix.ts`.
- [ ] Keep Bug #097 open until Product Owner UAT passes.

## Document Outstanding Balance Policy Hotfix – Bug #098

### Implementation Status

- [x] Added persisted per-definition outstanding balance policy.
- [x] Defaulted existing definitions to `BLOCK_DOWNLOAD` for legacy compatibility.
- [x] Added policy controls and persisted summary to the Document Definition UI.
- [x] Added completeness validation for invalid or missing policy values.
- [x] Centralized generated-document download/print authorization around policy, payment lock, readiness, current balance, and override state.
- [x] Implemented `IGNORE_BALANCE`, `BLOCK_DOWNLOAD`, `BLOCK_REQUEST`, and `ALLOW_ADMIN_OVERRIDE` behavior.
- [x] Added authorized admin allow/revoke balance override actions with audit and history records.
- [x] Added `scripts/verify-document-balance-policy-hotfix.ts`.
- [ ] Keep Bug #098 open until Product Owner UAT passes.

## Document Template Editor Reconstruction – Phase 2

### Architecture

- Authoritative models remain `DocumentDefinition`, `DocumentDefinitionField`, `DocumentTemplateSet`, `DocumentTemplateVersion`, request snapshots, generated document snapshots, verification tokens, and document counters.
- The selected editor foundation is a custom React structured editor using existing project dependencies. No TipTap, ProseMirror, Lexical, Slate, Quill, or Editor.js dependency was added.
- The editor stores schema version 2 JSON in `DocumentTemplateVersion.definitionJson`. Legacy schema version 1 `blocks` normalize into schema version 2 `header`, `body`, and `footer` sections.
- Draft save, publish, retire, duplicate, restore-as-draft, immutable published history, and assigned published template behavior continue through the existing template version workflow.
- Draft save and publish now include a loaded `updatedAt` token to reject stale overwrites.
- Template image uploads are tenant-scoped under existing upload storage and referenced from safe `/uploads/tenants/<tenant>/settings/document-templates/...` paths.
- Template administration uses a stricter document-template admin role gate instead of broad `Role.ADMIN` access.

### Implemented Editor Scope

- [x] Top app bar with template/version status, save draft, publish, print preview, and version navigation.
- [x] Ribbon tabs: Home, Insert, Layout, Table, Header/Footer, Dynamic Fields, Review.
- [x] Centered page preview with zoom, page size, orientation, margins, columns, page border, background, watermark, header, body, and footer.
- [x] Formatting controls for font family, font size, bold, italic, underline, alignment, text color, highlight, spacing, indentation, and line height.
- [x] Insertable blocks for text, text box, table, horizontal/vertical line, image, tenant logo, signature, QR placeholder, header, footer, and page break.
- [x] Allowlisted placeholder picker grouped by Tenant, Document, Subject, Property, Request, Signatory, and Verification.
- [x] Validation rejects unknown placeholders, unsupported block types, unsafe script-like content, unsafe colors, and unsafe image sources.
- [x] Focused verification harness `scripts/verify-professional-template-editor.ts`.

### Deferred Phase 3 Scope

- [ ] Exact Word-style pagination and page navigator.
- [ ] Ruler and tab stops.
- [ ] Merge/split table cells and repeated table header behavior.
- [ ] Full WYSIWYG PDF renderer that preserves all visual formatting.
- [ ] DOCX export parity for rich template styling.
- [ ] Public QR verification route.

### Release Gate

- [ ] Keep the professional template editor improvement open until Product Owner UAT confirms editor usability, publish history, snapshot immutability, security, and generated output expectations.

## Document Management UX and Walk-In Architecture - Phase 2A

Target lifecycle:

Document Type Configuration -> Template Draft -> Template Publication -> Homeowner, Household Member, or Walk-In Request -> Document Fee Payment when required -> Approval when required -> Generation using an immutable template snapshot -> Download or Office Release -> Receipt and Release Acknowledgement -> Verification and Audit History

Implemented in this phase:

- Document Management is the single administrator entry point; the legacy template route redirects to its Templates section.
- Operational document types are shown in one table, with diagnostics separated from normal operations.
- Walk-In / Office Request reads authoritative Document Definitions and filters by tenant, active state, archive state, walk-in availability, completeness, and published template availability.
- Current hardcoded walk-in fields remain compatibility-mode fields until the dynamic form reconstruction phase.

Deferred next phase:

- Full dynamic walk-in fields, document payment processing, release acknowledgement, public QR verification, and the professional editor remain separate work items.

## Certified Template Foundation - Phase 2B.1

Ownership architecture:

- `CERTIFIED` is the HOAHub-owned, immutable source category.
- `TENANT` is an editable tenant working copy with certified source lineage.
- `CUSTOM` is an editable tenant-owned template set with no certified source requirement.

The existing template set/version models remain authoritative. Additive metadata stores ownership, certified keys, source set/version references, clone version, clone date, upgrade compatibility, restorability, and editability. Existing rows backfill to `TENANT` through database defaults.

Certified updates create or prepare a new tenant draft; they never overwrite tenant drafts, published versions, or generated-document snapshots. Restore is backend-only in this phase and creates a new draft with backup metadata and an audit entry. Published versions remain immutable, and the existing document generation path continues to use the version snapshot already stored on each request/version.

## Document Platform Runtime Services - Milestone 2

The runtime foundation is organized behind authenticated `DocumentExecutionContext` services. Definitions resolve capabilities, templates use draft/published/retired versions, placeholders are allowlisted, policies return structured evaluations, workflows use `DocumentRequestHistory`, numbering uses tenant-definition counters, verification stores hashed random tokens, and notifications are idempotent `NotificationLog` events. These services are compatibility adapters around the current routes and do not replace the existing legacy request or generation flows until a later approved integration phase.
