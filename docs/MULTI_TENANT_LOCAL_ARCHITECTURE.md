# HOA Digital Hub Multi-Tenant Architecture

## Local-only implementation

This architecture is developed and validated only against the local MySQL database. Production, Hostinger, and GitHub are intentionally untouched.

## Tenant identity

- Every tenant has a unique URL slug.
- Legacy `/login` resolves to the default `pagsibol4b` tenant.
- `/{tenantSlug}/login` resolves the requested HOA and forwards its slug into authentication.
- Signed sessions contain `userId`, `role`, `tenantId`, and `tenantSlug`.
- The authenticated user is reloaded from MySQL and must match all signed tenant claims.

## Isolation controls

- All 47 existing tenant-owned tables have non-null `tenantId`, an index, and a restrictive foreign key.
- Platform-owned rate-limit events remain global.
- Tenant helpers require module entitlement and verify record ownership.
- Tenant status and subscription status are checked during login and authenticated access.
- Upload roots use `storage/uploads/tenants/{tenant-slug}`.
- The Prisma query boundary rejects tenant-owned queries without a verified tenant context and automatically scopes reads, aggregates, mutations, upserts, and creates.
- Nested creates inherit `tenantId`; scalar relation IDs are validated against the current tenant before writes reach MySQL.
- Business identifiers that may repeat between HOAs use tenant-composite unique indexes.
- Tenant registers without explicit pagination are capped at 500 rows by the data boundary.
- Private payment, chat, organization, and settings files require the authenticated tenant slug in their storage URL; legacy paths remain readable only by the default HOA.

## Roles

Enterprise roles are `SUPER_ADMIN`, `PLATFORM_ADMIN`, `HOA_ADMIN`, `BILLING_MANAGER`, `PAYROLL_MANAGER`, `STAFF`, `HOMEOWNER`, and `EMPLOYEE`. Legacy `SYSTEM_ADMIN` and `ADMIN` remain supported during the compatibility period.

## Numbering

`TenantSequence` provides atomic, tenant-and-year-scoped numbering for receipts and generated documents. Existing series can transition to this service without losing historical numbers.

## Subscription and suspension

`TenantModuleEntitlement` controls module availability per tenant. `TenantAdvisory` stores the message displayed when access is restricted. Disabled module checks return the standard subscription message.

## Production migration policy

Production migration must be executed only after explicit approval, a fresh production backup, dry-run validation on a restored copy, maintenance-window approval, and a documented rollback checkpoint.
