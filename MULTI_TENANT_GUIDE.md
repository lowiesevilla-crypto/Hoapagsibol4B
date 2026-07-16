# HOAHub Multi-Tenant Guide

**Product:** HOAHub – Multi-Tenant Digital Community Management Platform

**Version:** 1.0

**Last Updated:** July 11, 2026

**Document Owner:** Lowie M. Sevilla

---

# 1. Purpose

This document defines the official Multi-Tenant architecture, security model, onboarding process, and operational standards for HOAHub.

The Multi-Tenant architecture is the foundation of HOAHub and enables multiple Homeowners Associations (HOAs) to securely operate on a single platform while maintaining complete data isolation.

---

# 2. Multi-Tenant Architecture

Architecture Type

- Shared Database
- Shared Schema
- Tenant Isolation through `tenantId`

Each HOA is treated as an independent tenant with isolated:

- Users
- Homeowners
- Properties
- Finance
- Documents
- HRIS
- Community Data
- AI Knowledge Base
- Branding
- Settings

---

# 3. Tenant Principles

Every tenant must:

- Operate independently
- Never access another tenant's data
- Have configurable business rules
- Have independent branding
- Have independent billing rules
- Have independent AI responses
- Have independent audit logs

---

# 4. Tenant Identification

Every authenticated session must resolve:

- tenantId
- tenantName
- subscriptionPlan
- tenantStatus

Tenant identity must always come from the authenticated session.

Never trust tenantId from:

- Browser
- Request Body
- URL Parameters
- Hidden Fields

---

# 5. Tenant Branding

Each tenant can configure:

- HOA Name
- HOA Logo
- HOA Address
- HOA Contact Information
- HOA TIN
- HOA Registration Number
- Receipt Footer
- Official Signatories
- Theme Color (Future)

All printable documents inherit the tenant branding automatically.

---

# 6. Tenant Modules

Each tenant can enable or disable modules based on subscription or configuration.

Supported modules include:

- Homeowners
- Finance
- Documents
- Community
- HRIS
- AI
- Reports
- Facilities
- Visitor Management
- Vehicle Management

---

# 7. Tenant Subscription

Future subscription plans may include:

Starter

Professional

Enterprise

Each plan defines:

- Enabled Modules
- Maximum Homeowners
- Storage
- AI Usage
- Reports
- API Access

---

# 8. Tenant Security

Every query must include tenant filtering.

Correct Example

WHERE tenantId = sessionTenantId

Incorrect Example

WHERE tenantId = request.body.tenantId

Cross-tenant joins are prohibited unless explicitly authorized for SUPER_ADMIN administration.

---

# 9. Tenant Roles

Roles exist within each tenant.

Examples:

- HOA_ADMIN
- FINANCE
- PAYROLL_MANAGER
- EMPLOYEE
- HOMEOWNER
- SECURITY

SUPER_ADMIN operates across tenants but must explicitly select a tenant context before viewing tenant-specific data.

---

# 10. Tenant Data Isolation

Protected Data

- Homeowners
- Payments
- Bills
- Receipts
- Documents
- Employees
- Attendance
- Payroll
- AI Conversations
- Reports

Isolation must be enforced at both application and database query levels.

---

# 11. Tenant AI

Future AI capabilities are tenant-aware.

AI may answer questions about:

- Policies
- Bylaws
- Payments
- Documents
- Announcements

AI must never:

- Access another tenant's data
- Reveal personal information outside user permissions
- Invent policy information

---

# 12. Tenant Onboarding

New tenant creation includes:

1. Create Tenant
2. Create Default HOA Admin
3. Apply Default Branding
4. Initialize Settings
5. Apply Default Logo
6. Create Default Roles
7. Initialize Billing Rules
8. Create Audit Log
9. Activate Subscription

---

# 13. Tenant Suspension

When suspended:

- Login remains available for administrators (optional policy)
- Billing generation is disabled
- AI requests are disabled
- Homeowners see advisory messages
- Data remains intact

---

# 14. Tenant Backup

Each tenant must support:

- Database Backup
- Document Backup
- Configuration Export
- Restore Procedures

---

# 15. Compliance

HOAHub complies with:

- Philippine Data Privacy Act of 2012
- Tenant Isolation Principles
- Audit Logging
- Secure Authentication
- Role-Based Access Control

---

# 16. Future Enhancements

- White-label domains
- Custom email templates
- Custom themes
- Tenant analytics
- Cross-tenant reporting for SUPER_ADMIN
- Tenant API integrations

---

# Document History

| Version | Date | Description |
|----------|------|-------------|
| 1.0 | July 11, 2026 | Initial Multi-Tenant Guide |

---

# 17. Homeowner Mobile Tenant Rules

The homeowner mobile shell is authenticated and tenant-scoped.

Rules:

1. Resolve the homeowner with `requireUser(Role.HOMEOWNER)` or `requireHomeownerProfile()`.
2. Use `user.tenantId` or `profile.tenantId` explicitly for branding, module entitlements, and all portal reads.
3. Do not read tenant branding through a default fallback after authentication.
4. Do not accept `tenantId` from URL parameters, forms, local storage, or client state.
5. Filter mobile navigation and quick actions by tenant module entitlement.
6. Keep private homeowner financial data out of public caches and service-worker offline storage.

Sprint 6A portal reads explicitly apply tenant predicates for billing, payments, collections, documents, announcements, events, vehicles, organization officers, and document officer lookups. Product Owner UAT must verify that Test HOA and Pagsibol homeowner sessions do not share branding, content, balances, requests, or receipts.

# Document History Addendum

| Version | Date | Description |
|----------|------|-------------|
| 1.1 | July 15, 2026 | Added homeowner mobile tenant rules and PWA cache restrictions |

---

# 18. Tenant-Scoped Document Workflow Rules

Document catalogs, templates, household members, requests, generated documents, and edit audits are tenant-owned.

Rules:

1. `tenantId` must come from the authenticated user context.
2. Homeowner document subjects may be Self or an active `HouseholdMember` owned by the same tenant and homeowner.
3. Client-submitted configuration IDs and household member IDs must be reloaded and validated server-side.
4. `DocumentTypeConfiguration` may reference only a tenant-owned `DocumentTemplate`.
5. `DocumentFieldConfiguration` must belong to the same tenant and configuration.
6. Admin review and approval must load requests by authenticated tenant.
7. Generated-document download validates tenant, homeowner ownership, payment lock, and archival state.
8. Existing approved/generated documents remain immutable unless regenerated through the versioned workflow.

Changing Test HOA document settings, household members, templates, or request data must not affect Pagsibol, and Pagsibol changes must not affect Test HOA.

| Version | Date | Description |
|----------|------|-------------|
| 1.2 | July 15, 2026 | Added tenant-scoped document configuration, household subject, and snapshot rules |

## 19. Document Template Availability Rules

Authenticated document configuration reads must use the user's tenant ID explicitly. A configuration is homeowner-requestable only when:

1. the document type/configuration is active;
2. a required template is linked through `templateId`;
3. the linked template belongs to the same tenant;
4. the linked template matches the configuration's system document type;
5. the linked template is active/usable;
6. required workflow and field settings are valid.

The portal must not fall back to another tenant's template or infer a requestable template from display name alone. Admin screens may show incomplete configurations, but homeowner request forms must show only complete configurations.

Future custom document catalog records must keep `code` unique per tenant only. System-seeded and custom tenant-created records must be read, edited, archived, and assigned to templates within the authenticated tenant boundary.
## Tenant-Owned Document Definitions

Every Document Definition, template version, field configuration, workflow configuration, numbering rule, and signatory assignment must belong to one tenant.

Rules:

- Resolve tenantId from the authenticated session.
- Never trust tenantId from client input.
- Document codes are unique within a tenant, not globally.
- Cross-tenant template assignment is prohibited.
- Cross-tenant signatory assignment is prohibited.
- Requests must snapshot tenant-owned configuration before processing.
- Generated documents must remain bound to their original tenant and template version.

The additive document-definition migration keeps all compatibility relations tenant-first. `DocumentDefinition`, definition fields, template sets, template versions, definition counters, and verification tokens are tenant-scoped and must be resolved with an authenticated tenant ID. The local verification harness confirmed no cross-tenant links across configuration, field, template, request, or generated-version compatibility records.

Document Definition administration must use the authenticated user's tenant ID for every catalog, field, template, publish, retire, and requestability operation. A published template can be assigned only when the template version, template set, and definition all share the same tenant and definition relationship. Homeowner request forms may show only complete active definitions for the authenticated tenant.
