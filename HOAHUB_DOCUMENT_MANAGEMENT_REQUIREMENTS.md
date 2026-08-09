# HOAHub Tenant Document Management Requirements

**Product:** HOAHub – Multi-Tenant Digital Community Management Platform  
**Capability:** Tenant Document Repository / Document Management  
**Document Type:** Business, Functional, Security and Technical Requirements  
**Status:** Requirements Baseline  
**Date:** August 9, 2026

---

# 1. Purpose

This document defines the requirements for a tenant-isolated Document Management capability in HOAHub.

The capability allows each HOA tenant to maintain its own managed repository for association records such as:

- Bylaws
- Policies and Guidelines
- Memoranda
- Board / HOA Resolutions
- Circulars and Advisories
- Meeting Minutes
- Forms and Templates
- Government / Regulatory Documents
- Permits and Licenses
- Financial Reports
- Community Rules
- Facility Rules
- Security Guidelines
- Committee Documents
- Other Association Records

Authorized tenant users can upload, properly label, classify, download, preview, replace/revise, publish, archive, and permanently delete documents according to permissions and subscription limits.

Documents explicitly tagged for homeowner access may be viewed or downloaded only by authenticated homeowners belonging to the **same active tenant context**.

Document Management is also a **commercial HOAHub platform capability**. Subscription plans determine whether the feature is enabled and what storage / usage limits apply to each tenant.

---

# 2. Architecture Assessment of Current HOAHub

## 2.1 Multi-Tenant Foundation

HOAHub uses a shared-database/shared-schema architecture with tenant isolation through `tenantId`.

For Document Management:

- Every repository document must have exactly one `tenantId`.
- Tenant identity must come from the authenticated execution context.
- `tenantId` from request body, browser state, query string, route parameter, hidden field, or local storage must never be trusted as authorization authority.
- Every database query must filter using the authenticated tenant context.
- Every relationship to category, tag, uploader, revision, or generated document must be validated as same-tenant.

## 2.2 Existing HOAHub Generated-Document Platform

HOAHub already contains a separate document domain for generated / issued documents, including:

- `DocumentDefinition`
- `DocumentTemplateSet`
- `DocumentTemplateVersion`
- `DocumentRequest`
- `DocumentVersion`
- `DocumentPolicy`
- `DocumentWorkflowDefinition`
- `DocumentVerificationToken`
- numbering, approval history, audit and verification services

Those objects represent requestable and system-generated HOA documents.

**Architecture Decision:** arbitrary tenant-uploaded files must use a dedicated **Tenant Document Repository** domain and must not be stored as `DocumentVersion` records.

The repository and generated-document platform may later be linked through optional references, but their lifecycles remain separate.

## 2.3 Existing Storage Foundation

HOAHub already provides a configurable `STORAGE_ROOT` and tenant-specific storage helper with a structure equivalent to:

`storage/uploads/tenants/{tenantSlug}/...`

The repository should reuse this storage abstraction.

Recommended internal path:

`storage/uploads/tenants/{tenantSlug}/documents/repository/{yyyy}/{mm}/{uuid}.{ext}`

The physical file path/storage key is internal only and must never be used as the access-control mechanism.

## 2.4 Existing Upload Delivery Security Constraint

The current generic `/uploads/[...segments]` route serves stored files directly and applies public immutable caching.

**Repository documents must not use that route.**

All repository preview/download access must pass through an authenticated service that:

1. resolves the authenticated user;
2. resolves the active tenant context;
3. confirms Document Management subscription entitlement;
4. reloads the repository record by `tenantId + documentId`;
5. checks role/permission;
6. checks visibility/status/effective dates;
7. resolves the storage key server-side;
8. streams the file with private/no-store security headers as appropriate.

---

# 3. Business Objectives

The Document Management capability shall:

1. Give each entitled tenant a completely isolated document repository.
2. Allow tenant administrators to manage official HOA files in one location.
3. Make selected governance/community documents available to homeowners without exposing internal records.
4. Prevent document content, metadata, identifiers, search results, URLs, or binaries from crossing tenant boundaries.
5. Support controlled revision/replacement of official records.
6. Reclaim storage when a file is permanently deleted or replaced according to retention policy.
7. Record privileged document actions in HOAHub audit logs.
8. Enforce subscription plan feature and storage limits.
9. Allow future migration to S3-compatible/object storage without changing business workflows.
10. Provide a foundation for future AI knowledge-base ingestion using only tenant-authorized documents.

---

# 4. Subscription and Commercial Requirements

## 4.1 Separate Platform Entitlement

Recommended new `TenantModule` value:

`DOCUMENT_MANAGEMENT`

Keep existing `DOCUMENTS` for generated/requested HOA documents.

This allows HOAHub to commercially offer:

- Generated Documents only
- Document Management only
- Both capabilities

## 4.2 Subscription Gate

Access shall be evaluated in this order:

1. Tenant status allows platform access.
2. Tenant subscription status allows the feature.
3. Current plan or tenant override enables `DOCUMENT_MANAGEMENT`.
4. For write operations, tenant is within applicable storage/usage limits.
5. User has the required tenant-scoped permission.
6. Requested document belongs to the active tenant.
7. Document lifecycle and visibility rules allow the requested action.

A user permission must never activate a module that the tenant did not purchase.

## 4.3 Storage Limits

HOAHub already supports `SubscriptionPlan.maximumStorageMb`.

V1 may use that as the total tenant storage quota.

Recommended future generic plan-limit capabilities:

- `DOCUMENT_REPOSITORY_STORAGE_MB`
- `DOCUMENT_REPOSITORY_MAX_FILE_MB`
- `DOCUMENT_REPOSITORY_MAX_DOCUMENTS`
- `DOCUMENT_REPOSITORY_VERSION_RETENTION`
- `DOCUMENT_REPOSITORY_BULK_UPLOAD`

A generic plan-limit/feature model is preferred over adding a new database column for every future limit.

## 4.4 Tenant-Specific Commercial Overrides

Platform Admin should be able to grant tenant-specific overrides such as:

- additional repository storage;
- temporary storage increase;
- promotional Document Management enablement;
- higher maximum upload size;
- enterprise version-retention entitlement.

Every override must be audit logged.

## 4.5 Recommended Initial Packaging

| Plan | Document Management | Recommended Capability |
| --- | --- | --- |
| Trial | Limited / configurable | Small storage allowance for evaluation |
| Standard | Optional add-on or included | Core upload, categories, public/internal visibility, search, replace, delete |
| Professional | Included | Higher storage, bulk upload, revisions, expiry controls, richer audit |
| Enterprise | Included | Custom storage, longer version retention, export/migration, future governance controls |

Assignments and limits must be configured in Platform Admin and not hardcoded in UI logic.

## 4.6 Upgrade Behavior

When a tenant upgrades and gains Document Management:

- module appears after entitlement refresh;
- no code deployment is required;
- new storage limits apply immediately;
- existing repository data remains intact.

## 4.7 Downgrade / Feature Removal

A downgrade must not immediately destroy files.

Recommended behavior:

- block new upload and replacement when entitlement is removed or quota exceeded;
- provide tenant administrators read/download access during a configurable grace period;
- keep existing data intact;
- allow Platform Admin to restore entitlement or add storage;
- permanent deletion only occurs through an explicit authorized deletion action or approved tenant-offboarding process.

---

# 5. Core Domain Rules

## DMR-001 — Tenant Ownership

Every repository record belongs to exactly one tenant.

## DMR-002 — Tenant Context Authority

Tenant context comes only from authenticated server-side context.

## DMR-003 — Tenant Public Is Not Internet Public

`TENANT_PUBLIC` means visible to authenticated users/homeowners of the same tenant only.

No anonymous public document URL is created.

## DMR-004 — Internal Documents

`INTERNAL` documents are never visible to homeowners.

## DMR-005 — Permanent Deletion

Deleting a document permanently removes the active binary and active repository record to reclaim storage.

A minimal immutable audit/tombstone record may remain but must not retain:

- document binary;
- downloadable copy;
- reusable storage path;
- sensitive extracted content.

## DMR-006 — Replacement / Revision

For ordinary documents, replacement may keep the same logical document identity while replacing its binary.

For official governance documents such as **Bylaws, Policies, Guidelines, Memoranda, and Resolutions**, HOAHub should support controlled revision metadata so users do not silently overwrite official history.

## DMR-007 — Generated Document Separation

Repository files use dedicated repository models/services.

## DMR-008 — Deny by Default

If entitlement, tenant scope, permission, visibility, status, or storage validation cannot be positively established, access is denied.

---

# 6. Governance Document Classification

Recommended default tenant document categories:

1. **Bylaws**
2. **Policies and Guidelines**
3. **Board / HOA Resolutions**
4. **Memoranda**
5. **Circulars and Advisories**
6. **Meeting Minutes**
7. **Forms and Templates**
8. **Government / Regulatory Documents**
9. **Permits and Licenses**
10. **Financial Reports**
11. **Community Rules**
12. **Facilities and Amenities**
13. **Security and Safety**
14. **Committee Documents**
15. **Contracts / Vendor Documents**
16. **Other Documents**

Categories are tenant-owned and may be customized.

System may seed the names above when Document Management is first enabled for a tenant, but the seed records must belong to that tenant.

---

# 7. Recommended Document Metadata

Each repository document should support:

### Required

- `tenantId`
- `title`
- `categoryId`
- `status`
- `visibility`
- current file metadata
- uploaded/created by
- created timestamp
- modified timestamp

### Optional

- description
- reference/document number
- resolution number
- memorandum number
- policy code
- tags
- issuing body / committee
- approval/adoption date
- effective date
- expiry date
- revision/version label
- supersedes document ID
- source/origin
- notes

Examples:

- Bylaws: `Bylaws 2026 Revision`
- Resolution: `Resolution No. 2026-014 – Revised Vehicle Sticker Rules`
- Memorandum: `Memorandum No. 2026-08 – Waste Collection Schedule`
- Policy: `POL-SEC-003 – Visitor Access Policy`

---

# 8. Roles and Permission Requirements

Recommended permissions:

- `document_repository.read`
- `document_repository.upload`
- `document_repository.update_metadata`
- `document_repository.replace`
- `document_repository.publish`
- `document_repository.archive`
- `document_repository.delete`
- `document_repository.download_internal`
- `document_repository.manage_categories`
- `document_repository.manage_visibility`
- `document_repository.audit_read`
- `document_repository.storage_read`
- `document_repository.read_public`

Recommended defaults:

- `HOA_ADMIN`: all repository permissions.
- approved tenant/system administrators: based on explicit permission assignment.
- `STAFF`: read/upload/update only when granted; permanent delete disabled by default.
- `HOMEOWNER`: `document_repository.read_public` only.
- `SUPER_ADMIN` / `PLATFORM_ADMIN`: tenant context must be explicitly selected before tenant repository access.

Authorization must be enforced server-side.

---

# 9. Functional Requirements

## 9.1 Repository Landing Page

### DMR-FR-001

Authorized tenant users shall have a Document Management page listing only documents owned by the active tenant.

### DMR-FR-002

Search shall support:

- document title;
- original filename;
- reference number;
- resolution number;
- memorandum number;
- policy code;
- description;
- tags.

### DMR-FR-003

Filters shall support:

- category;
- status;
- visibility;
- uploader;
- file type;
- upload date;
- effective date;
- expiry date.

### DMR-FR-004

Sort shall support title, category, uploaded date, modified date, size, status, and effective date.

### DMR-FR-005

Repository list shall display at minimum:

- title;
- document/reference number when present;
- category;
- file type;
- size;
- status;
- visibility;
- revision/version label;
- effective date;
- uploaded by;
- last modified date;
- permission-controlled actions.

### DMR-FR-006

Queries shall be paginated and tenant-filtered at database level.

---

## 9.2 Upload

### DMR-FR-010

Authorized users may upload a document if the tenant has Document Management entitlement and sufficient storage quota.

### DMR-FR-011

V1 supports single-file upload. Bulk upload is recommended for Professional/Enterprise.

### DMR-FR-012

Required upload fields:

- title;
- file;
- category;
- visibility;
- status/publication state.

### DMR-FR-013

Optional metadata:

- description;
- document/reference number;
- issuing body;
- tags;
- approval/adoption date;
- effective date;
- expiry date;
- revision/version label;
- notes.

### DMR-FR-014

The server validates entitlement and quota before writing the file.

### DMR-FR-015

Stored filenames must use server-generated UUID/random names.

### DMR-FR-016

Original filename is retained as metadata only.

### DMR-FR-017

Recommended initial file types:

- PDF
- DOC / DOCX
- XLS / XLSX
- PPT / PPTX
- TXT / CSV
- JPG / JPEG / PNG / WEBP

Executable, script and unapproved archive formats are denied by default.

### DMR-FR-018

Extension and content/MIME signature must be validated server-side.

### DMR-FR-019

Each binary receives a SHA-256 checksum.

### DMR-FR-020

Maximum file size is controlled by platform/plan configuration.

---

## 9.3 Labels, Categories and Tags

### DMR-FR-030

Every document must have a human-readable title independent of the filename.

### DMR-FR-031

Categories are tenant-owned.

### DMR-FR-032

A category belonging to Tenant A cannot be assigned to a Tenant B document.

### DMR-FR-033

Documents may have multiple tenant-owned tags.

### DMR-FR-034

Category/tag duplicate prevention is scoped per tenant.

---

## 9.4 Visibility

Use:

- `INTERNAL`
- `TENANT_PUBLIC`

### DMR-FR-040

New documents default to `INTERNAL` unless the authorized user intentionally selects homeowner visibility.

### DMR-FR-041

Changing to `TENANT_PUBLIC` requires `document_repository.manage_visibility`.

### DMR-FR-042

Homeowners must not see internal documents in counts, API results, search suggestions, URLs, or metadata.

### DMR-FR-043

Tenant-public visibility still respects status/effective/expiry rules.

---

## 9.5 Status

Recommended status enum:

- `DRAFT`
- `ACTIVE`
- `ARCHIVED`

Expiry should be derived from `expiresAt` rather than creating a conflicting mutable status.

### DMR-FR-050

`DRAFT` is administrative only.

### DMR-FR-051

`ACTIVE + TENANT_PUBLIC` is homeowner-visible when effective and not expired.

### DMR-FR-052

`ARCHIVED` remains available to authorized administrators but is hidden from homeowners.

### DMR-FR-053

Expired documents automatically stop appearing in the homeowner library without destroying the record.

---

## 9.6 Governance Revision Rules

### DMR-FR-060

Official governance records may be marked `revisionControlled = true`.

Recommended default revision-controlled categories:

- Bylaws
- Policies and Guidelines
- Resolutions
- Memoranda

### DMR-FR-061

When replacing a revision-controlled document, the user must provide one of:

- correction reason;
- revision label;
- superseding document/reference;
- effective date change.

### DMR-FR-062

Replacement audit shall record:

- actor;
- timestamp;
- reason;
- prior checksum;
- prior size;
- prior original filename;
- new checksum;
- new size;
- new filename metadata.

### DMR-FR-063

For storage-saving V1 behavior, previous binary may be permanently removed after successful replacement while retaining only replacement audit metadata.

### DMR-FR-064

For Professional/Enterprise, HOAHub may later offer **retained revision binaries** as a paid feature so historical versions can remain downloadable.

### DMR-FR-065

A Resolution should normally be superseded by another Resolution rather than silently edited. The UI shall display a warning when replacing an `ACTIVE` Resolution.

---

## 9.7 Preview

### DMR-FR-070

PDF and approved images may be previewed in browser.

### DMR-FR-071

Office documents may remain download-only until a secure conversion/viewer service is approved.

### DMR-FR-072

Preview uses the same authorization checks as download.

---

## 9.8 Download

### DMR-FR-080

Downloads must use an authenticated repository endpoint, for example:

`GET /api/document-repository/{documentId}/download`

### DMR-FR-081

The endpoint reloads using authenticated `tenantId + documentId`.

### DMR-FR-082

The response must not reveal the physical storage path.

### DMR-FR-083

Download filename should use the current original/display filename safely encoded.

### DMR-FR-084

Internal downloads require administrative read/download permission.

### DMR-FR-085

Tenant-public homeowner downloads require:

- active homeowner/authenticated user;
- same active tenant;
- Document Management entitlement;
- `TENANT_PUBLIC` visibility;
- `ACTIVE` status;
- effective date satisfied;
- not expired.

### DMR-FR-086

Repository responses should use private/no-store or otherwise appropriate authenticated caching and must not use the current public immutable upload caching pattern.

---

## 9.9 Replace Document

### DMR-FR-090

Authorized users may replace a document binary without changing the logical document ID.

### DMR-FR-091

The new file is validated and stored first.

### DMR-FR-092

Database activation and replacement audit occur before the prior binary is removed.

### DMR-FR-093

If replacement fails before activation, the existing document remains valid and unchanged.

### DMR-FR-094

If cleanup of the prior binary fails after successful activation, the system records an operational cleanup task/error so orphan storage can be reclaimed safely.

### DMR-FR-095

Storage quota check must account for temporary replacement overhead and final new size.

---

## 9.10 Edit Metadata

### DMR-FR-100

Authorized users may update title, description, category, tags, visibility, status, effective/expiry dates, and governance metadata without re-uploading the binary.

### DMR-FR-101

Changes to visibility, status, category, document number, effective date, and expiry date are audit logged.

---

## 9.11 Permanent Delete

### DMR-FR-110

Delete requires `document_repository.delete`.

### DMR-FR-111

The UI must display an irreversible action warning.

### DMR-FR-112

Recommended confirmation requires the user to confirm the document title or select an explicit “Permanently delete file” acknowledgement.

### DMR-FR-113

Deletion process:

1. load record inside authenticated tenant boundary;
2. re-check permission;
3. capture safe tombstone/audit metadata;
4. remove binary from storage;
5. remove active database document and tag links;
6. update tenant storage usage;
7. write final audit event.

### DMR-FR-114

If the storage binary cannot be deleted, do not falsely report a successful permanent deletion. Record an operational failure for retry/reconciliation.

### DMR-FR-115

Homeowners can never delete repository documents.

---

## 9.12 Homeowner Document Library

### DMR-FR-120

Homeowner portal shall include a Document Library only when the tenant has `DOCUMENT_MANAGEMENT` enabled.

### DMR-FR-121

Homeowners see only same-tenant documents satisfying:

- `visibility = TENANT_PUBLIC`;
- `status = ACTIVE`;
- effective date is null or reached;
- expiry date is null or not reached.

### DMR-FR-122

Homeowner library shall support search and category filters.

### DMR-FR-123

Recommended homeowner display sections:

- Bylaws
- Policies & Guidelines
- Resolutions
- Memoranda / Circulars
- Forms
- Meeting / Community Documents
- Other Public Documents

### DMR-FR-124

Homeowner document library must be responsive/mobile-friendly.

---

# 10. Recommended Data Model

## 10.1 Enums

### `TenantDocumentVisibility`

- `INTERNAL`
- `TENANT_PUBLIC`

### `TenantDocumentStatus`

- `DRAFT`
- `ACTIVE`
- `ARCHIVED`

### `TenantDocumentScanStatus`

- `NOT_CONFIGURED`
- `PENDING`
- `PASSED`
- `FAILED`
- `BLOCKED`

## 10.2 `TenantDocumentCategory`

Recommended fields:

- `id`
- `tenantId`
- `code`
- `name`
- `description?`
- `displayOrder`
- `active`
- `revisionControlled`
- timestamps

Constraints:

- `@@unique([tenantId, id])`
- `@@unique([tenantId, code])`
- optional normalized unique name per tenant

## 10.3 `TenantDocument`

Recommended fields:

- `id`
- `tenantId`
- `categoryId`
- `title`
- `description?`
- `referenceNumber?`
- `issuingBody?`
- `visibility`
- `status`
- `revisionControlled`
- `revisionLabel?`
- `approvalDate?`
- `effectiveAt?`
- `expiresAt?`
- `supersedesDocumentId?`
- `storageKey`
- `originalFileName`
- `contentType`
- `extension`
- `fileSize`
- `sha256`
- `scanStatus`
- `uploadedById`
- `updatedById?`
- timestamps

All category/uploader/self-relations must be tenant-safe.

## 10.4 `TenantDocumentTag`

Recommended fields:

- `id`
- `tenantId`
- `name`
- `normalizedName`

Unique per tenant.

## 10.5 `TenantDocumentTagAssignment`

Composite tenant-safe relationship between document and tag.

## 10.6 `TenantDocumentRevisionAudit`

Metadata-only audit for replacement events if prior binaries are not retained.

Recommended fields:

- tenant/document/actor IDs;
- reason;
- previous filename;
- previous content type;
- previous size;
- previous checksum;
- new filename;
- new size;
- new checksum;
- revision labels;
- correlation ID;
- timestamp.

## 10.7 Tenant Storage Usage

Recommended scalable model:

`TenantStorageUsage`

- `tenantId`
- `scope` (e.g. `DOCUMENT_REPOSITORY`, `TOTAL_UPLOADS`)
- `usedBytes`
- `reconciledAt`
- `updatedAt`

Usage counters should be reconciled periodically against actual storage to detect orphan/missing files.

---

# 11. Storage and Security Requirements

## SEC-001

Repository binaries must live outside the static `public` directory.

## SEC-002

No raw storage key is accepted from clients for download/delete/replace.

## SEC-003

Every action loads the document by authenticated `tenantId` and document ID.

## SEC-004

Use randomized physical filenames to prevent predictable enumeration.

## SEC-005

Reject directory traversal and unsafe filenames.

## SEC-006

Validate actual file content/signature where practical in addition to extension and MIME type.

## SEC-007

Recommended malware scanning interface should exist even if V1 uses `NOT_CONFIGURED` while no scanning provider is deployed.

## SEC-008

Files marked `BLOCKED` or failed malware scan may not be previewed/downloaded to homeowners.

## SEC-009

Use `Content-Disposition`, `X-Content-Type-Options: nosniff`, appropriate CSP/sandboxing for preview, and private cache controls.

## SEC-010

Never render uploaded HTML/JS/SVG as trusted first-party content.

## SEC-011

Audit logs should not store full binary content or unnecessarily sensitive extracted text.

## SEC-012

Tenant isolation must be tested using at least two tenants with similarly named categories and documents.

---

# 12. Audit Requirements

At minimum audit:

- upload;
- download of internal documents where required by audit policy;
- metadata changes;
- visibility changes;
- status changes;
- replacement;
- publish/activate;
- archive;
- permanent delete;
- category creation/update/deactivation;
- storage-limit override;
- subscription entitlement change.

Audit should include:

- tenant;
- actor;
- effective role/permission;
- action;
- document ID/title or safe tombstone identity;
- previous/new values where applicable;
- timestamp;
- reason where required;
- correlation ID;
- IP/user agent using existing audit conventions where available.

---

# 13. UX Requirements

## Administrator

Recommended navigation:

`Documents > Document Management`

Do not mix arbitrary repository files directly into `Document Requests` or `Document Templates` screens.

Repository actions:

- Upload Document
- Preview
- Download
- Edit Details
- Replace / Upload Revision
- Change Visibility
- Archive
- Permanently Delete

Storage indicator example:

`Document Storage: 742 MB of 2 GB used`

Warn at configurable thresholds, recommended:

- 80% informational warning
- 90% strong warning
- 100% block upload/replace

## Homeowner

Recommended navigation:

`Documents > HOA Document Library`

Show only tenant-public documents.

---

# 14. Non-Functional Requirements

## NFR-001 — Tenant Isolation

Cross-tenant document leakage tolerance is zero.

## NFR-002 — Performance

Repository list/search should remain responsive with pagination and indexed tenant/category/status/visibility fields.

## NFR-003 — Reliability

Upload, replace, and delete flows must handle database/storage partial failures deterministically.

## NFR-004 — Storage Portability

Business services must use a storage adapter interface so local filesystem can later be replaced by S3-compatible storage.

Recommended adapter operations:

- `put`
- `open/readStream`
- `delete`
- `exists`
- `stat`

## NFR-005 — Observability

Log repository operation failures with correlation ID, tenant ID, action, and safe object ID. Do not log document binary content.

## NFR-006 — Accessibility

Repository admin/homeowner pages should follow HOAHub accessibility conventions and support keyboard-accessible actions.

---

# 15. Suggested API / Service Surface

Suggested administrative endpoints/services:

- `GET /api/document-repository`
- `POST /api/document-repository`
- `GET /api/document-repository/{id}`
- `PATCH /api/document-repository/{id}`
- `POST /api/document-repository/{id}/replace`
- `GET /api/document-repository/{id}/preview`
- `GET /api/document-repository/{id}/download`
- `DELETE /api/document-repository/{id}`
- category/tag administration endpoints
- storage usage endpoint

Suggested homeowner endpoint:

- `GET /api/homeowner/document-library`
- `GET /api/homeowner/document-library/{id}/download`

All endpoints derive tenant context server-side.

---

# 16. Additional Functions Recommended Beyond Initial Request

The following are strongly recommended because they make the repository operationally complete:

1. **Subscription entitlement** — sell Document Management per platform plan.
2. **Storage quota enforcement** — protect infrastructure cost and support commercial tiers.
3. **Categories + tags** — proper labeling and discovery.
4. **Search/filter/sort** — essential once tenants accumulate documents.
5. **Effective and expiry dates** — important for policies, permits and guidelines.
6. **Governance revision control** — prevents silent overwriting of bylaws/resolutions/policies.
7. **Audit trail** — necessary for accountability.
8. **Private authenticated download route** — prevents cross-tenant/public exposure.
9. **Checksum** — integrity verification and duplicate detection support.
10. **Malware-scan status abstraction** — safer future upload processing.
11. **Storage usage dashboard** — visibility for tenants and Platform Admin.
12. **Plan-specific bulk upload/version retention** — useful commercial differentiators.
13. **Superseded-document linkage** — especially useful for Resolutions, Bylaws and Policies.
14. **Optional expiration notifications** — future alert for expiring permits/policies.
15. **Future AI eligibility flag** — explicit opt-in for documents allowed in tenant AI knowledge base; never automatically ingest all repository documents.

---

# 17. Acceptance Criteria / UAT

## Tenant Isolation

- [ ] Tenant A admin cannot list Tenant B documents.
- [ ] Tenant A admin cannot download a Tenant B document by guessing ID.
- [ ] Tenant A homeowner cannot view Tenant B tenant-public documents.
- [ ] Same filenames/categories across tenants do not conflict.
- [ ] Storage paths remain tenant-isolated.

## Subscription

- [ ] Tenant without `DOCUMENT_MANAGEMENT` cannot access repository UI/API.
- [ ] Adding entitlement exposes the feature without deployment.
- [ ] Upload is blocked when quota is exhausted.
- [ ] Existing documents remain intact after downgrade.
- [ ] Plan/tenant overrides are audit logged.

## Upload

- [ ] Allowed file uploads successfully.
- [ ] Disallowed type is rejected.
- [ ] Oversized file is rejected according to plan/configuration.
- [ ] Server-generated physical filename is used.
- [ ] Checksum and metadata are stored.

## Visibility

- [ ] Internal document never appears in homeowner portal.
- [ ] Tenant-public active document appears only to same-tenant homeowners.
- [ ] Draft/archive/expired document does not appear to homeowners.

## Governance Documents

- [ ] Tenant can upload Bylaws.
- [ ] Tenant can upload Policies and Guidelines.
- [ ] Tenant can upload Memoranda.
- [ ] Tenant can upload Resolutions.
- [ ] Tenant can upload Other categorized documents.
- [ ] Revision-controlled replacement requires reason/revision metadata.
- [ ] Replacing an active Resolution shows a governance warning.

## Replace

- [ ] New binary is validated before activation.
- [ ] Failed replacement leaves current file unchanged.
- [ ] Successful replacement deletes old binary when no retained-version entitlement exists.
- [ ] Replacement audit metadata remains.

## Delete

- [ ] Delete requires explicit permission.
- [ ] Delete displays irreversible warning.
- [ ] Successful delete removes binary and active repository record.
- [ ] Storage usage decreases.
- [ ] Minimal audit/tombstone evidence remains.
- [ ] Homeowners cannot delete.

## Search and UX

- [ ] Admin search/filter works within active tenant only.
- [ ] Homeowner search operates only on eligible tenant-public documents.
- [ ] Mobile homeowner document library is usable and has normal navigation/back behavior.

---

# 18. Recommended Implementation Phases

## Phase 1 — Foundation

- Add `DOCUMENT_MANAGEMENT` tenant module entitlement.
- Add repository enums/models/migration.
- Add categories and default tenant category seeding.
- Add private repository storage adapter/service.
- Add quota calculations.
- Add repository authorization helpers.

## Phase 2 — Tenant Administration

- Repository list/search/filter.
- Upload.
- Metadata/category/tag management.
- Preview/download.
- Replace/revision.
- Archive.
- Permanent delete.
- Audit integration.

## Phase 3 — Homeowner Library

- Homeowner document library.
- Tenant-public filtering.
- Search/category filters.
- Mobile/responsive UX.

## Phase 4 — Platform Commercial Controls

- Plan configuration for `DOCUMENT_MANAGEMENT`.
- Storage and feature-limit UI.
- Tenant-specific overrides.
- Usage dashboard and quota warnings.

## Phase 5 — Advanced / Paid Enhancements

- bulk upload;
- retained historical binaries/version download;
- expiry notifications;
- export/migration;
- object-storage adapter;
- malware scanning provider;
- approved AI knowledge-base ingestion;
- advanced records governance.

---

# 19. Definition of Done

Document Management is complete for initial production when:

- tenant repository models and migration are deployed;
- subscription entitlement is enforced;
- tenant storage isolation is enforced;
- private authenticated file delivery is implemented;
- upload/download/replace/archive/delete are operational;
- categories, tags, visibility and status are supported;
- Bylaws, Policies & Guidelines, Memoranda, Resolutions and Other documents can be properly classified;
- homeowner tenant-public library is available;
- storage quotas are enforced;
- audit events are recorded;
- cross-tenant automated tests pass;
- UAT covers two or more tenants;
- no repository binary is exposed through the generic public upload route;
- permanent deletion reclaims storage;
- deployment and rollback procedures are documented.
