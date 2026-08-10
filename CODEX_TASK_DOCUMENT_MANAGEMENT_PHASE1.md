# Codex Task — HOAHub Document Management Phase 1 Completion

## Context

Repository: `lowiesevilla-crypto/Hoapagsibol4B`  
Branch: `feature/document-management-phase1`  
Parent epic: #77  
Phase 1 issue: #78  
Draft PR: #84  
Requirements: `HOAHUB_DOCUMENT_MANAGEMENT_REQUIREMENTS.md`  
UI standard: `HOAHUB_DOCUMENT_MANAGEMENT_UI_SPEC.md`

The branch now contains the initial repository schema/migration plus security, storage, quota, lifecycle, audit, entitlement and UI-foundation code. Complete and harden the integration; do not redesign it into the generated-document domain.

## Architecture decision

HOAHub will use **generic commercial feature entitlements** for new paid platform capabilities:

- feature code `DOCUMENT_MANAGEMENT` for the tenant repository;
- existing `TenantModule.DOCUMENTS` remains for generated/requested HOA documents;
- future features such as `AI_ASSISTANCE` may reuse the same feature-entitlement mechanism without extending `TenantModule` for every product capability.

Current models:

- `SubscriptionPlanFeatureEntitlement`
- `TenantFeatureEntitlement`

This directly supports plan packaging, tenant-specific overrides, storage limits, file-size limits and revision-retention limits.

## Non-negotiable security rules

1. Arbitrary tenant uploads never use generated `DocumentVersion`.
2. All repository records are tenant-scoped.
3. Tenant authority comes from authenticated server context, never client-submitted tenant IDs.
4. Feature entitlement is checked before RBAC permission.
5. A user permission cannot activate a feature the tenant did not purchase.
6. Repository files are never served from `/uploads/[...segments]`.
7. Homeowners receive only same-tenant `TENANT_PUBLIC` + `PUBLISHED` + currently effective + safe documents.
8. Platform/Super Admin content access still requires explicit tenant context.
9. Downgrade/over-quota never automatically deletes files.
10. No AI behavior is implemented in this phase; #83 is separate.

## Existing implementation to review

- `prisma/document-management.prisma`
- `prisma/migrations/20260809230000_document_management_repository/migration.sql`
- `lib/document-repository/constants.ts`
- `lib/document-repository/entitlement.ts`
- `lib/document-repository/access.ts`
- `lib/document-repository/storage.ts`
- `lib/document-repository/validation.ts`
- `lib/document-repository/quota.ts`
- `lib/document-repository/lifecycle.ts`
- `lib/document-repository/audit.ts`
- `lib/authorization/permissions.ts`
- `tests/unit/document-repository-foundation.test.ts`

## Remaining implementation tasks

### 1. Validate entitlement resolution

Confirm `resolveDocumentManagementEntitlement()` correctly resolves:

1. current tenant;
2. current/effective subscription plan;
3. `SubscriptionPlanFeatureEntitlement`;
4. optional `TenantFeatureEntitlement` overrides;
5. effective enabled state;
6. storage limit;
7. max file size;
8. revision-retention settings.

Add unit/integration tests for:

- plan enabled;
- plan disabled;
- tenant override enabling a disabled plan feature;
- tenant override disabling an enabled plan feature;
- tenant storage/file-size override;
- cross-tenant entitlement lookup blocked.

### 2. Tenant isolation integration tests

Add database-backed coverage proving:

- Tenant A cannot read Tenant B repository documents;
- Tenant A cannot update/delete Tenant B document by known ID;
- Tenant A cannot connect Tenant B category/tag/document relationship;
- repository lists/searches remain tenant filtered;
- knowing a storage key does not bypass tenant checks.

Use existing `lib/db.ts` tenant-boundary behavior and repository service guards. Do not weaken either layer.

### 3. Repository service boundary

Create a server-only repository service layer for database operations. Routes/actions must not directly scatter `prisma.repositoryDocument` calls throughout the app.

Minimum service contracts:

- list/search documents;
- get document by ID in active tenant;
- create/upload metadata transaction;
- replace/create revision;
- publish/unpublish/archive;
- permanent delete;
- secure download/preview lookup;
- category initialization/management;
- storage usage calculation.

Every public service must resolve tenant context, feature entitlement and required permission before operating.

### 4. Default category initialization

Implement an idempotent initializer using `repositoryDefaultCategories`.

- categories belong to the active tenant;
- do not create global/shared categories;
- do not overwrite tenant customizations on normal re-initialization;
- set governance-control flag for governed categories.

### 5. Upload atomicity

Implement the logical upload transaction:

1. resolve entitlement and permission;
2. validate file and effective max size;
3. calculate current repository storage usage;
4. enforce effective quota;
5. write randomized tenant storage object;
6. create repository metadata;
7. create revision metadata when required;
8. audit action;
9. if DB creation fails after file write, delete the orphan binary safely.

### 6. Permanent deletion

Implement idempotent delete flow:

- permission required;
- same-tenant record reloaded;
- remove current binary and retained revision binaries subject to policy;
- remove active repository data;
- preserve immutable `AuditLog` tombstone metadata without binary/storage path exposure;
- missing storage object must not become a cross-tenant or path-injection fallback.

### 7. Schema/migration review

Review `prisma/document-management.prisma` and the migration for:

- composite tenant relationships on category/document/revision/tag assignments;
- appropriate indexes;
- plan/tenant entitlement integrity;
- actor IDs sourced only from authenticated context;
- drift risk between hand-written migration constraints and Prisma schema;
- MySQL compatibility.

Do not add cross-file Prisma relations to central `Tenant`/`User` models merely for convenience if they create unnecessary churn; service-layer actor validation is acceptable if documented and tested.

### 8. Professional UI boundary

Do not add an unconditional sidebar link before the route is entitlement-aware. Phase 2 navigation must be computed/gated using the effective `DOCUMENT_MANAGEMENT` feature and repository read permission.

Reuse the UI primitives already on the branch and follow `HOAHUB_DOCUMENT_MANAGEMENT_UI_SPEC.md`.

### 9. Quality gates

Run the same gates as HOAHub CI:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm exec prisma validate
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm db:seed
pnpm test
pnpm test:integration
pnpm test:critical
pnpm typecheck
pnpm build
```

If any suite cannot run, state exactly why. Never report skipped work as passing.

## Definition of Done

Phase 1 is complete when:

- generic `DOCUMENT_MANAGEMENT` plan/tenant entitlement is correctly resolved and tested;
- repository schema/migration validates and deploys;
- repository operations are tenant-safe and service-layer gated;
- storage/validation/quota/audit/access helpers compile and pass tests;
- tenant default categories initialize idempotently;
- database isolation tests pass;
- existing generated documents remain independent under `DOCUMENTS`;
- `/uploads/[...segments]` is not used for repository delivery;
- HOAHub CI is green.
