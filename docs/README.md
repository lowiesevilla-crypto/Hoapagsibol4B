# HOAHub Documentation Index

**Owner:** Lowie M. Sevilla  
**Last reviewed:** August 5, 2026

This index identifies the authoritative HOAHub documents and distinguishes current guidance from historical working material. GitHub Issues and Projects are the source of truth for executable delivery work.

## Authoritative product documents

| Document | Purpose | Status | Owner | Review cadence |
|---|---|---|---|---|
| [HOAHub Commercial MVP and Pilot Release Standard](product/HOAHUB_COMMERCIAL_MVP.md) | Defines pilot scope, workflows, release gates, metrics, and UAT evidence | Proposed pending PR approval | Product owner | Before every pilot/release decision |
| [HOAHub Product Roadmap](../HOAHUB_PRODUCT_ROADMAP.md) | Defines product direction and planned phases | Current strategic roadmap | Product owner | Monthly |
| [HOAHub Master Engineering Guide](../HOAHUB_MASTER_GUIDE.md) | Governs engineering, architecture, security, and delivery principles | Current | Product owner / engineering owner | Quarterly or after material architecture change |
| [Delivery Governance](product/DELIVERY_GOVERNANCE.md) | Defines backlog, issue, project, prioritization, and traceability rules | Current after merge | Product owner | Monthly |

## Authoritative engineering and operations documents

| Document | Purpose | Status |
|---|---|---|
| [System Architecture](../SYSTEM_ARCHITECTURE.md) | Application architecture and technical boundaries | Current; validate against implementation before material changes |
| [Database Design](../DATABASE_DESIGN.md) | Database domain and data-model design | Current; Prisma schema remains implementation authority |
| [Multi-Tenant Guide](../MULTI_TENANT_GUIDE.md) | Tenant-isolation design and implementation guidance | Current |
| [User Roles and Permissions](../USER_ROLES_AND_PERMISSIONS.md) | Current role model and authorization guidance | Current but subject to issue #26 |
| [Coding Standards](../CODING_STANDARDS.md) | Code-quality and implementation standards | Current |
| [Testing Guide](../TESTING_GUIDE.md) | Required testing levels and quality gates | Current; automation expansion tracked in issue #25 |
| [GitHub Workflow](GITHUB_WORKFLOW.md) | Branch, pull-request, issue, and repository workflow | Current |
| [Deployment](../DEPLOYMENT.md) | Production deployment process | Current |
| [Production Checklist](../PRODUCTION_CHECKLIST.md) | Production readiness and release checklist | Current |
| [Database Operations](DATABASE_OPERATIONS.md) | Backup, import, restore, and database operations | Current |
| [MySQL Migration Guide](MYSQL_MIGRATION_GUIDE.md) | Migration guidance | Current |
| [Hostinger Deployment Guide](Pagsibol_HOA_Portal_Hostinger_Deployment_Guide.md) | Current GitHub-to-Hostinger deployment procedure | Current |
| [Technical Setup Guide](Pagsibol_HOA_Portal_Technical_Setup_Guide.md) | Current MySQL setup and troubleshooting | Current |
| [User Manual](Pagsibol_HOA_Portal_User_Manual.md) | Role-based operational guidance | Current; verify against each release |

## Working and historical documents

The following categories may contain useful discovery, implementation history, or release evidence, but they are not the authoritative source for active work:

- `PRODUCT_BACKLOG.md`
- `PRODUCT_IMPROVEMENT_BACKLOG.md`
- `SESSION_PROGRESS.md`
- `KNOWN_ISSUES.md`
- `CODEX_TASK_*.md`
- sprint task/design files
- release-specific notes and UAT records
- existing DOCX packages that describe earlier local or PostgreSQL configurations

Actionable items from these files must be represented by GitHub Issues. After migration, historical files should be marked superseded or moved to an archive without deleting required audit or release evidence.

The `screenshots/` directory contains captured portal screens used by current or historical documentation. Screenshots must be checked for sensitive data before publication.

## Source-of-truth rules

1. **Product scope:** approved product documents and recorded product-owner decisions.
2. **Executable work:** GitHub Issues.
3. **Priority and status:** GitHub Project fields.
4. **Implementation:** merged source code, Prisma migrations, configuration templates, and reviewed pull requests.
5. **Release evidence:** CI results, UAT records, release notes, deployment records, and linked issues/PRs.
6. **Architecture decisions:** Architecture Decision Records for significant, difficult-to-reverse decisions.

When two documents conflict, create or update a GitHub Issue and resolve the conflict through an explicit owner decision. Do not silently choose the less restrictive security, tenant-isolation, finance-integrity, privacy, or recovery requirement.

## Document status convention

Every material document should state one of:

- **Current** — authoritative for its stated purpose.
- **Proposed** — awaiting approval.
- **Superseded** — replaced by a named document or issue.
- **Historical** — retained for traceability, not active direction.
- **Draft** — incomplete and not approved for implementation.

Every current or proposed document should identify an owner and review date or cadence.
