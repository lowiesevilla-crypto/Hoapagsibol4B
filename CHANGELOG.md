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
