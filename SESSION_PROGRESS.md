# Session Progress

## 2026-07-09 - Sprint 2.1 Finance Engine SOA v1

Branch:
feature/soa-v1

Completed:

- Added the homeowner Statement of Account route at `/admin/homeowners/[id]/soa`.
- Added a Statement of Account action from the homeowner detail page.
- Built a tenant-scoped SOA data service from existing bills, payments, homeowner collections, and bond refunds.
- Added account summary, running ledger, payment history, billing history, aging summary, print action, and PDF download.
- Reused existing HOA association settings, document branding, QR pattern, payment coverage formatting, and receipt-style document layout.
- Preserved existing authentication, RBAC, tenant routing, and database schema.

Validation:

- pnpm typecheck: Passed
- pnpm build: Passed

Not included:

- No Prisma models.
- No database migrations.
- No payment gateway.
- No AI features.
- No production deployment.
- SOA QR opens the tenant-scoped SOA route; persisted public SOA verification is deferred to a later sprint.

## 2026-07-09 - Develop Tenant Login URL Release Blocker

Branch:
develop

Completed:

- Fixed tenant login URL behavior from Platform Tenant Management.
- Confirmed tenant list and tenant detail links point to `/{tenantSlug}/login`.
- Updated tenant login routing so Platform Admin and Super Admin sessions can preview tenant login pages without wrong redirects.
- Preserved existing redirect behavior for signed-in tenant users.

Validation:

- pnpm typecheck: Pending
- pnpm build: Pending

Not included:

- No deployment.
- No merge to main.
- No database migrations.
- No unrelated UI changes.

## 2026-07-09 - Phase 1 SUPER_ADMIN Platform Permission Hotfix

Branch:
feature/subscription-management

Completed:

- Fixed platform role inheritance so SUPER_ADMIN satisfies PLATFORM_ADMIN authorization checks.
- Updated the Platform layout to use the centralized `requireUser(Role.PLATFORM_ADMIN)` check.
- Preserved PLATFORM_ADMIN access to Platform Management pages.
- Preserved middleware blocking for HOA_ADMIN and tenant users on `/platform/*`.

Validation:

- pnpm typecheck: Passed
- pnpm build: Passed

Not included:

- No Prisma models.
- No database migrations.
- No payment gateway.
- No AI features.
- No production deployment.
