# HOAHub Documentation Index

**Owner:** Lowie M. Sevilla  
**Last reviewed:** August 5, 2026

This index identifies the authoritative HOAHub documents and distinguishes current guidance from historical working material.

GitHub Issues are the source of truth for executable delivery work. A GitHub Project board is not currently established; project-board adoption and exhaustive migration of historical backlog entries were deferred by the product owner in issue #27. Until a Project is adopted, priority, ownership, and delivery status must be recorded directly on each active GitHub Issue.

## Authoritative product documents

| Document | Purpose | Status | Owner | Review cadence |
|---|---|---|---|---|
| [HOAHub Commercial MVP and Pilot Release Standard](product/HOAHUB_COMMERCIAL_MVP.md) | Defines pilot scope, workflows, release gates, metrics, and UAT evidence | Current; approved through PR #29 | Product owner | Before every pilot/release decision |
| [HOAHub Product Roadmap](../HOAHUB_PRODUCT_ROADMAP.md) | Defines product direction and planned phases | Current strategic roadmap | Product owner | Monthly |
| [HOAHub Master Engineering Guide](../HOAHUB_MASTER_GUIDE.md) | Governs engineering, architecture, security, and delivery principles | Current | Product owner / engineering owner | Quarterly or after material architecture change |
| [Delivery Governance](product/DELIVERY_GOVERNANCE.md) | Defines issue readiness, prioritization, traceability, review cadence, and definition of done | Current | Product owner | Monthly |
| [Legacy Document Register](product/LEGACY_DOCUMENT_REGISTER.md) | Classifies superseded, historical, and intentionally retained working documents | Current | Product owner | During documentation cleanup or release review |

## Authoritative engineering and operations documents

| Document | Purpose | Status |
|---|---|---|
| [System Architecture](../SYSTEM_ARCHITECTURE.md) | Application architecture and technical boundaries | Current; validate against implementation before material changes |
| [Database Design](../DATABASE_DESIGN.md) | Database domain and data-model design | Current; Prisma schema remains implementation authority |
| [Multi-Tenant Guide](../MULTI_TENANT_GUIDE.md) | Tenant-isolation design and implementation guidance | Current |
| [Authorization Permissions](authorization-permissions.md) | Current additive-role and named-permission architecture | Current; completion work tracked in issue #26 |
| [User Roles and Permissions](../USER_ROLES_AND_PERMISSIONS.md) | Legacy and operational role guidance | Current only where consistent with the authorization architecture |
| [Coding Standards](../CODING_STANDARDS.md) | Code-quality and implementation standards | Current |
| [Testing Guide](../TESTING_GUIDE.md) | Required testing levels and quality gates | Current; issue #25 completed |
| [GitHub Workflow](GITHUB_WORKFLOW.md) | Branch, pull-request, issue, and repository workflow | Current |
| [Deployment](../DEPLOYMENT.md) | Production deployment process | Current |
| [Production Checklist](../PRODUCTION_CHECKLIST.md) | Production readiness and release checklist | Current |
| [Database Operations](DATABASE_OPERATIONS.md) | Backup, import, restore, and database operations | Current |
| [MySQL Migration Guide](MYSQL_MIGRATION_GUIDE.md) | Migration guidance | Current |
| [Hostinger Deployment Guide](Pagsibol_HOA_Portal_Hostinger_Deployment_Guide.md) | Current GitHub-to-Hostinger deployment procedure | Current |
| [Technical Setup Guide](Pagsibol_HOA_Portal_Technical_Setup_Guide.md) | Current MySQL setup and troubleshooting | Current |
| [User Manual](Pagsibol_HOA_Portal_User_Manual.md) | Role-based operational guidance | Current; verify against each release |

## Historical and superseded material

The following categories are retained for discovery, implementation history, UAT evidence, or release traceability. They are not authoritative sources for active work:

- `PRODUCT_BACKLOG.md`
- `PRODUCT_IMPROVEMENT_BACKLOG.md`
- `SESSION_PROGRESS.md`
- `KNOWN_ISSUES.md`
- `IMPLEMENTATION_PLAN.md`
- `HOAHUB_FUNCTIONAL_AUDIT.md`
- `CODEX_TASK_*.md`
- sprint task and design files
- release-specific notes and UAT records
- earlier DOCX packages describing local, PostgreSQL, or superseded deployment configurations

The [Legacy Document Register](product/LEGACY_DOCUMENT_REGISTER.md) records the status and intended use of these files. Historical documents may contain unchecked boxes, statuses such as Backlog or Testing, and incomplete plans. Those markers do not create active commitments. When the product owner selects an item for execution, create or update a GitHub Issue with current scope and acceptance criteria.

The `screenshots/` directory contains captured portal screens used by current or historical documentation. Screenshots must be checked for sensitive data before publication.

## Source-of-truth rules

1. **Product scope:** approved product documents and recorded product-owner decisions.
2. **Executable work:** active GitHub Issues.
3. **Priority, owner, and status:** the active GitHub Issue until a Project board is adopted.
4. **Implementation:** merged source code, Prisma migrations, configuration templates, and reviewed pull requests.
5. **Release evidence:** CI results, UAT records, release notes, deployment records, and linked issues/PRs.
6. **Architecture decisions:** Architecture Decision Records for significant, difficult-to-reverse decisions.
7. **Historical evidence:** files classified by the Legacy Document Register; historical checklists are not active backlog.

When two documents conflict, create or update a GitHub Issue and resolve the conflict through an explicit owner decision. Do not silently choose the less restrictive security, tenant-isolation, finance-integrity, privacy, or recovery requirement.

## Document status convention

Every material document should state one of:

- **Current** — authoritative for its stated purpose.
- **Proposed** — awaiting approval.
- **Superseded** — replaced by a named document, issue, or implementation.
- **Historical** — retained for traceability, not active direction.
- **Draft** — incomplete and not approved for implementation.

Every current or proposed document should identify an owner and review date or cadence.
