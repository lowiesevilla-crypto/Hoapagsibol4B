
# v1.0 RC1 (2026-07-06)

## Added
- Multi-tenant SaaS architecture
- Platform Administration
- HOA Administration
- Homeowner Portal
- Employee Portal
- Billing, Payments, Collections
- Attendance and Payroll
- Documents, Reports, Announcements, Events, Chat
- GitHub CI and Hostinger auto deployment

## Fixed
- Tenant login branding
- Default tenant logo fallback
- Platform logout redirect
- Cross-tenant login/session isolation
- Employee primary role persistence
- Payroll Manager access
- Billing Manager access
- GitHub smoke test for tenant-branded login page

## Known Issues
- Password visibility toggle may behave inconsistently in local development only.
# Changelog

All notable changes follow Keep a Changelog and semantic versioning.

## [2.0.0] - 2026-06-30

### Changed

- Migrated Prisma and the complete application database from PostgreSQL to MySQL 8.
- Replaced historical executable migrations with a reviewed MySQL baseline and operator rollback SQL.
- Converted seed data to configuration and lookup records only.
- Added provider-neutral full-model database export/import with count verification.
- Added a database-aware health endpoint.

### Added

- MySQL Docker development service.
- GitHub Actions MySQL verification and Hostinger deployment workflow.
- Pre-deployment database/upload backups, immutable releases, PM2 startup, and rollback tooling.
- MySQL migration, database operations, GitHub workflow, and Hostinger production guides.

### Security

- Excluded secrets, runtime uploads, logs, caches, backups, and installer binaries from source control.
