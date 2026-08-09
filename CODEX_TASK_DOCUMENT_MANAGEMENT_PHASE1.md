# Codex Task — HOAHub Document Management Phase 1

## Context

Repository: `lowiesevilla-crypto/Hoapagsibol4B`  
Branch: `feature/document-management-phase1`  
Parent epic: #77  
Phase 1 issue: #78  
Draft PR: #84  
Requirements: `HOAHUB_DOCUMENT_MANAGEMENT_REQUIREMENTS.md`  
UI standard: `HOAHUB_DOCUMENT_MANAGEMENT_UI_SPEC.md`

This task completes the schema/runtime integration for the Tenant Document Repository foundation already started on the branch.

## Non-negotiable architecture

1. Do not store arbitrary tenant uploads in generated-document `DocumentVersion`.
2. Do not reuse `TenantModule.DOCUMENTS` for repository entitlement.
3. Add `TenantModule.DOCUMENT_MANAGEMENT` as a distinct commercial capability.
4. All repository records are tenant-scoped.
5. Tenant authorization comes from server execution context, never client-submitted tenant IDs.
6. All repository file reads/downloads must use protected routes/services; never use `/uploads/[...segments]`.
7. Preserve existing generated Document Platform behavior.
8. Do not introduce AI behavior in this phase. #83 is the next-phase AI Assistance epic.

## Existing branch foundation

Review and retain/refine these files:

- `lib/document-repository/constants.ts`
- `lib/document-repository/storage.ts`
- `lib/document-repository/validation.ts`
- `lib/document-repository/quota.ts`
- `lib/document-repository/access.ts`
- `lib/document-repository/lifecycle.ts`
- `lib/document-repository/audit.ts`
- `lib/authorization/permissions.ts`

Do not weaken their deny-by-default behavior to make tests pass.

## Task 1 — Extend TenantModule

Update `prisma/schema.prisma`:

```prisma
enum TenantModule {
  ...
  DOCUMENTS
  DOCUMENT_MANAGEMENT
  ...
}
```

Keep `DOCUMENTS` unchanged for generated/requested documents.

## Task 2 — Add repository enums

Add:

```prisma
enum RepositoryDocumentVisibility {
  INTERNAL
  TENANT_PUBLIC
  RESTRICTED
}

enum RepositoryDocumentStatus {
  DRAFT
  PUBLISHED
  INACTIVE
  ARCHIVED
}

enum RepositoryDocumentRevisionPolicy {
  REPLACE_CURRENT
  KEEP_HISTORY
}

enum RepositoryMalwareScanStatus {
  NOT_CONFIGURED
  PENDING
  PASSED
  FAILED
  BLOCKED
}
```

## Task 3 — Add repository models

Implement tenant-safe models with composite tenant identifiers/relations wherever practical.

### RepositoryDocument

Required fields:

- `id String @id @default(cuid())`
- `tenantId String`
- `categoryId String`
- `title String`
- `description String? @db.Text`
- `documentReference String?`
- `visibility RepositoryDocumentVisibility @default(INTERNAL)`
- `status RepositoryDocumentStatus @default(DRAFT)`
- `currentRevision Int @default(1)`
- `revisionPolicy RepositoryDocumentRevisionPolicy @default(REPLACE_CURRENT)`
- `originalFileName String @db.VarChar(255)`
- `storageKey String @db.VarChar(500)`
- `contentType String @db.VarChar(191)`
- `fileSizeBytes BigInt`
- `checksumSha256 String @db.VarChar(64)`
- `malwareStatus RepositoryMalwareScanStatus @default(NOT_CONFIGURED)`
- `effectiveAt DateTime?`
- `expiresAt DateTime?`
- `publishedAt DateTime?`
- `uploadedById String`
- `updatedById String?`
- governance metadata where useful: `issuingBody`, `approvalDate`, `resolutionNumber`, `memorandumNumber`, `policyCode`, `revisionLabel`
- `createdAt`, `updatedAt`

Relations:

- tenant
- category
- uploader
- updater
- revisions
- tags through assignment table

Indexes/constraints:

- `@@unique([tenantId, id])`
- index tenant/status/visibility/updatedAt
- index tenant/category/status
- index tenant/documentReference
- index tenant/effectiveAt/expiresAt as useful

### RepositoryDocumentRevision

Required fields:

- id
- tenantId
- documentId
- revision
- originalFileName
- `storageKey String?` (nullable after historical binary purge)
- contentType
- fileSizeBytes
- checksumSha256
- malwareStatus
- reason optional text
- createdById
- createdAt

Use `@@unique([tenantId, documentId, revision])` and tenant-safe relationship to the document.

### RepositoryDocumentCategory

Required fields:

- id
- tenantId
- code
- name
- group/code grouping string
- description optional
- `governed Boolean @default(false)`
- `active Boolean @default(true)`
- sortOrder
- timestamps

Use unique tenant/code and tenant/id.

### RepositoryDocumentTag

- id
- tenantId
- name
- timestamps
- unique tenant/name and tenant/id

### RepositoryDocumentTagAssignment

- tenantId
- documentId
- tagId
- composite PK
- tenant-safe relationships to document and tag

## Task 4 — Add opposite relations

Add clear repository relation fields to `Tenant` and `User`.

Suggested Tenant fields:

- `repositoryDocuments`
- `repositoryDocumentRevisions`
- `repositoryDocumentCategories`
- `repositoryDocumentTags`
- `repositoryDocumentTagAssignments`

Suggested User fields with named relations:

- repository documents uploaded
- repository documents updated
- repository revisions created

Keep relation names explicit to avoid Prisma ambiguity.

## Task 5 — Module enforcement mapping

Update `lib/db.ts` `modelModules` so repository tenant models map to `TenantModule.DOCUMENT_MANAGEMENT`.

At minimum:

- `RepositoryDocument`
- `RepositoryDocumentRevision`
- `RepositoryDocumentCategory`
- `RepositoryDocumentTag`
- `RepositoryDocumentTagAssignment`

Confirm tenant-boundary extension scopes all repository queries/writes automatically.

## Task 6 — Entitlement resolution

Review how `enabledModules` is built in `lib/db.ts` / tenant context.

Document Management must be enabled when the tenant's effective commercial entitlement enables `DOCUMENT_MANAGEMENT`.

Do not allow a user permission to activate a module that the tenant has not purchased.

If the current product materializes effective plan modules into `TenantModuleEntitlement`, retain that architecture. If plan modules and tenant overrides must be merged at runtime, implement the smallest consistent correction and add tests.

Platform/Super Admin content access must still have explicit tenant context and must not become an invisible cross-tenant bypass.

## Task 7 — Seed default categories

Update the normal seed/bootstrap path so enabling/initializing Document Management can create tenant-owned categories from `repositoryDefaultCategories`.

Do not create globally shared categories.

Seed must be idempotent.

Do not overwrite tenant-customized category names/descriptions on every application seed.

## Task 8 — Migration

Create a Prisma migration for:

- TenantModule enum change;
- repository tables;
- indexes/unique constraints/FKs.

Do not hand-edit existing applied migrations.

## Task 9 — Tests

Add focused tests consistent with the repository's current test framework.

Required coverage:

1. Tenant A repository model query cannot read Tenant B records.
2. Tenant A cannot connect Tenant B category/tag/revision relationship.
3. Missing `DOCUMENT_MANAGEMENT` entitlement rejects repository model access.
4. Repository permission does not bypass missing entitlement.
5. `repositoryStorage` rejects a storage key from another tenant.
6. traversal-like storage keys are rejected.
7. quota blocks an upload that would exceed the plan limit.
8. downgrade/over-quota read policy does not imply deletion.
9. homeowner lifecycle helper rejects INTERNAL/DRAFT/ARCHIVED/expired/future-effective/cross-tenant/blocked-malware documents.
10. valid same-tenant TENANT_PUBLIC + PUBLISHED document is eligible.
11. upload validator rejects executable type, MIME mismatch, bad PDF/image signature, oversize file.
12. validator returns SHA-256 for valid binary.

## Task 10 — Validate the whole repository

Run exactly the same quality gates expected by CI where feasible:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm exec prisma validate
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm test
pnpm test:integration
pnpm test:critical
pnpm typecheck
pnpm build
```

If local MySQL-dependent suites cannot run, state exactly which were not run and why. Do not claim success for skipped tests.

## Task 11 — Review branch for compile/runtime issues

Specifically inspect the newly added foundation for:

- Node/Next.js server-only assumptions;
- `BigInt` handling;
- Prisma JSON typing;
- module enum typing after `DOCUMENT_MANAGEMENT` is generated;
- path handling on Linux/Windows;
- storage key traversal edge cases;
- plan limit semantics when `maximumStorageMb` is null or zero;
- permission defaults;
- public upload route leakage.

Refactor where needed, preserving the security requirements.

## Task 12 — PR update

Update PR #84 description/checklist after implementation with:

- migration name;
- models added;
- tests added;
- commands run and results;
- known limitations;
- explicit confirmation that `/uploads/[...segments]` is not used for repository delivery.

Keep PR #84 draft until CI is green and Phase 1 acceptance criteria are satisfied.

## Definition of Done

Phase 1 is complete only when:

- `DOCUMENT_MANAGEMENT` is a real generated Prisma `TenantModule` value;
- repository schema/migration is valid;
- repository models are automatically tenant-scoped and module-gated;
- storage/validation/quota/audit/access helpers compile and are tested;
- default categories can be initialized per tenant;
- cross-tenant isolation tests pass;
- existing generated documents remain functional under `DOCUMENTS`;
- CI quality gates pass.
