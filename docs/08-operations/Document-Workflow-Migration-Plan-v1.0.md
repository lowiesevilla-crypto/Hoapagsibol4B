# Document Workflow Migration Plan v1.0

## Migration

Migration file:

`prisma/migrations/20260722120000_document_workflow_execution_engine/migration.sql`

The migration is additive and supports configurable document workflow execution.

## Schema Changes

- Add `DOCUMENT_FEE` to `PaymentRequestType`.
- Add workflow runtime statuses to `DocumentRequestStatus`.
- Add `issuedAt` to `DocumentRequest`.
- Link `DocumentRequest` to one document-fee `PaymentRequest`.
- Add `documentRequestId` to `PaymentRequest`.
- Add tenant-scoped unique/index support for document-fee payment requests.
- Add household-member validation and revocation fields.

## Local Application

`pnpm exec prisma migrate deploy` was used for the local development database because `migrate dev` could not create a shadow database with the current MySQL permissions.

No production migration was applied.

## Rollout Notes

Before applying outside local development:

1. Confirm production backup exists.
2. Run `pnpm exec prisma migrate status` against the target environment.
3. Review migration SQL for additive-only changes.
4. Apply with the approved deployment process.
5. Run Prisma validate/generate and production smoke tests.
6. Verify existing requests remain readable.
7. Verify no duplicate document-fee PaymentRequest records are created.
8. Verify paid document approval creates a linked Collection receipt.
9. Verify preview does not allocate official records.
10. Verify tenant isolation for cross-tenant request and payment access.

## Recovery Notes

The migration does not drop or rewrite existing document records. If application rollout is paused after migration, legacy enum-based document flows remain present. New statuses and nullable columns are backward-compatible with existing rows.

## Deferred Operations

- Production deployment.
- Public QR verification reconstruction.
- Walk-in payment cashiering.
- Release acknowledgment workflow.
- Full document-fee accounting beyond PaymentRequest and Collection linkage.
