# HOAHub Coding Standards

**Product:** HOAHub – Multi-Tenant Digital Community Management Platform

**Version:** 1.0

**Last Updated:** July 11, 2026

**Document Owner:** Lowie M. Sevilla

---

# 1. Purpose

This document defines the official development standards for HOAHub.

All developers, AI coding assistants, and future contributors must follow these standards.

Deviation from these standards requires approval from the project owner.

---

# 2. Development Principles

Every feature developed for HOAHub must follow these principles.

✓ Security First

✓ Tenant First

✓ Mobile First

✓ Reusable Code

✓ Configurable

✓ AI Ready

✓ Audit Ready

✓ Production Ready

---

# 3. Technology Stack

Frontend

- Next.js
- React
- TypeScript

Backend

- Next.js Server Actions

Database

- MySQL

ORM

- Prisma ORM

Authentication

- NextAuth

Version Control

- Git
- GitHub

IDE

- Visual Studio Code

AI Development

- Codex

---

# 4. Multi-Tenant Rules

Every business operation must be tenant scoped.

Never trust tenantId from:

- Request Body
- Query String
- Client State
- Browser Storage

Always resolve tenant from the authenticated session.

Every database query must include tenant filtering.

Example

Correct

WHERE tenantId = sessionTenant

Incorrect

WHERE tenantId = request.body.tenantId

Cross-tenant access is prohibited.

---

# 5. Role-Based Access Control

Every server action must verify authorization.

Supported roles include:

- SUPER_ADMIN
- HOA_ADMIN
- FINANCE
- PAYROLL_MANAGER
- EMPLOYEE
- HOMEOWNER
- SECURITY

Never rely solely on client-side role checks.

---

# 6. Coding Standards

Use TypeScript.

Avoid any unless absolutely necessary.

Prefer strongly typed interfaces.

Use descriptive variable names.

Avoid duplicate logic.

Extract reusable functions into services.

Keep business rules outside UI components.

Prefer composition over duplication.

---

# 7. Folder Organization

Example

app/

components/

lib/

lib/actions/

lib/services/

prisma/

docs/

tasks/

work/

Keep business logic inside lib/services whenever possible.

---

# 8. Database Standards

Use Prisma ORM.

Do not use raw SQL unless required.

Use Prisma transactions for financial operations.

Never duplicate financial data.

Never manually edit migration history.

Every schema change must use Prisma Migrate.

---

# 9. Financial Module Rules

There must only be:

One Billing Engine

One Balance Engine

One Payment Engine

One Receipt Engine

Never create duplicate financial calculations.

Reuse existing financial services.

Financial transactions must be immutable.

---

# 10. Validation Standards

Validate on both:

Client

Server

Never trust browser validation.

Validate:

Required fields

Ranges

Formats

Permissions

Tenant

Business Rules

---

# 11. Error Handling

Provide meaningful user-friendly messages.

Do not expose stack traces.

Log technical details internally.

Use consistent notification styles.

Avoid silent failures.

---

# 12. Audit Logging

Critical actions must record:

Tenant

User

Timestamp

Module

Action

Before Value

After Value

Examples:

Billing

Payments

Receipts

Documents

Settings

Payroll

---

# 13. Security Standards

Passwords must be encrypted.

Use HTTPS.

Protect sensitive routes.

Validate every request.

Prevent cross-tenant access.

Prevent privilege escalation.

Never expose confidential data in logs.

Follow the Philippine Data Privacy Act of 2012.

---

# 14. UI/UX Standards

Responsive Design

Desktop

Tablet

Mobile

Consistent spacing

Clear typography

Readable tables

Professional layout

Accessible navigation

Minimal clicks

Consistent dialogs

Consistent notifications

---

# 15. Table Standards

Every large table should support:

Search

Sorting

Pagination

Filtering

Responsive Layout

Empty State

Loading State

Export when appropriate

---

# 16. Form Standards

Use clear labels.

Show validation messages.

Preserve entered values after validation failures.

Use dropdowns where appropriate.

Use searchable dropdowns for large datasets.

Display success confirmation.

---

# 17. Performance Standards

Avoid unnecessary database queries.

Reuse existing queries.

Use indexes.

Use pagination.

Avoid loading entire datasets.

Optimize images.

Optimize rendering.

Use lazy loading where appropriate.

---

# 18. AI Development Standards

AI-generated code must:

Follow existing architecture.

Reuse existing services.

Avoid duplicate business logic.

Respect RBAC.

Respect tenant isolation.

Never expose another tenant's information.

Remain explainable and maintainable.

---

# 19. Git Workflow

Development Flow

feature/*

↓

develop

↓

main

↓

production

Never develop directly on main.

Use descriptive commit messages.

Keep commits focused.

Update documentation before merge.

---

# 20. Quality Gates

Before every merge, execute:

Prisma Validate

Prisma Generate

Typecheck

Clean Build

Regression Testing

User Acceptance Testing

No merge unless all checks pass.

---

# 21. Documentation Standards

Every completed sprint must update:

IMPLEMENTATION_PLAN.md

PRODUCT_IMPROVEMENT_BACKLOG.md

SESSION_PROGRESS.md

RELEASE_NOTES.md

Task documentation

Relevant architecture documentation

---

# 22. Testing Standards

Every feature must complete:

Unit Testing (where applicable)

Integration Testing

Regression Testing

Mobile Testing

User Acceptance Testing

Tenant Isolation Testing

Role Permission Testing

---

# 23. Production Rules

Never deploy directly from a feature branch.

Production deployments must come from main.

Backup before deployment.

Verify migrations.

Verify environment variables.

Verify build.

Verify tenant isolation.

---

# 24. Definition of Done

A feature is considered complete only when:

✓ Development Completed

✓ Documentation Updated

✓ Validation Passed

✓ Typecheck Passed

✓ Build Passed

✓ Mobile Tested

✓ UAT Passed

✓ Regression Passed

✓ Tenant Isolation Verified

✓ Audit Logging Verified

✓ Approved by Product Owner

---

# 25. Guiding Principles

Every decision should prioritize:

Security

Scalability

Maintainability

User Experience

Performance

Configurability

Tenant Isolation

Code Reusability

Long-Term Sustainability

---

# Document History

| Version | Date | Description |
|----------|------|-------------|
| 1.0 | July 11, 2026 | Initial Coding Standards |