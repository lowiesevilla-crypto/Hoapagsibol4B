# HOAHub System Architecture

**Product:** HOAHub – Multi-Tenant Digital Community Management Platform

**Version:** 1.0

**Last Updated:** July 11, 2026

**Document Owner:** Lowie M. Sevilla

---

# 1. Purpose

This document describes the overall technical architecture of HOAHub.

It serves as the primary technical reference for developers, architects, AI-assisted development, deployment, maintenance, and future enhancements.

---

# 2. Architecture Overview

HOAHub follows a modern multi-tier SaaS architecture.

```
                    Internet
                        │
                        ▼
               HTTPS / SSL
                        │
                        ▼
              Hostinger Node.js Hosting
                        │
                        ▼
                 Next.js Application
                        │
      ┌─────────────────┼──────────────────┐
      ▼                 ▼                  ▼
Server Actions      API Routes       Authentication
      │
      ▼
Business Services
      │
      ▼
Prisma ORM
      │
      ▼
MySQL Database
```

---

# 3. High-Level Components

The platform consists of the following layers:

- Presentation Layer
- Business Logic Layer
- Data Access Layer
- Database Layer
- Security Layer
- AI Layer (Future)
- Integration Layer

---

# 4. Presentation Layer

Technology

- Next.js
- React
- TypeScript

Responsibilities

- User Interface
- Responsive Design
- Forms
- Tables

---

# Sprint 6A Addendum - Tenant Document Workflows

Document requests now flow through a shared tenant-scoped workflow:

1. Admin configures an active `DocumentTypeConfiguration`.
2. Admin defines required `DocumentFieldConfiguration` rows for the homeowner form.
3. Homeowner selects Self or a registered household/family member.
4. Server validates tenant, homeowner ownership, subject ownership, active configuration, required fields, fee mode, and template availability.
5. The request stores immutable subject/configuration/data snapshots.
6. Admin review writes final reviewed values and field-level `DocumentRequestEditAudit` entries.
7. Generation uses reviewed snapshots when present and preserves generated versions.

Delivery modes supported:

- `INSTANT_DOWNLOAD`
- `APPROVAL_REQUIRED`
- `PAYMENT_REQUIRED`
- `PAYMENT_AND_APPROVAL_REQUIRED`
- `REQUEST_ONLY`

Paid-document accounting is intentionally not posted in Sprint 6A. Requests store fee and payment-required snapshots and block homeowner downloads until a later finance integration confirms payment.
- Dashboards
- Mobile Support
- Client Validation

Characteristics

- Mobile First
- Responsive
- Component Based
- Accessible
- Tenant Branded

---

# 5. Business Logic Layer

Technology

- Next.js Server Actions

Responsibilities

- Business Rules
- Billing Logic
- Payment Processing
- Validation
- Authorization
- Workflow Processing

Examples

- Billing Generation
- SOA Generation
- Payment Posting
- Receipt Generation
- Document Approval

---

# 6. Data Access Layer

Technology

- Prisma ORM

Responsibilities

- Database Queries
- Transactions
- Relationships
- Data Integrity
- Migrations

Principles

- No raw SQL unless required
- Use Prisma Transactions
- Parameterized Queries
- Strong Type Safety

---

# 7. Database Layer

Technology

- MySQL

Core Database

One shared database with complete tenant isolation.

Major Tables

- Tenant
- User
- Homeowner
- Property
- Bill
- Payment
- Receipt
- BillingRule
- DuesExemption
- Documents
- Employees
- Attendance
- Payroll

---

# 8. Multi-Tenant Architecture

Architecture Type

Shared Database

Shared Schema

Tenant Isolation

Every business table contains:

- tenantId

Every query must filter using:

tenantId

Example

```
SELECT *

FROM Bill

WHERE tenantId = currentTenant
```

Never trust tenantId from client input.

Tenant must always come from the authenticated session.

---

# 9. Authentication

Current Technology

NextAuth

Responsibilities

- Login
- Logout
- Session Management
- Password Security

Future

- MFA
- SSO
- OAuth

---

# 10. Authorization

Role Based Access Control

Roles

- SUPER_ADMIN
- HOA_ADMIN
- FINANCE
- PAYROLL_MANAGER
- EMPLOYEE
- HOMEOWNER
- SECURITY

Permissions are role driven.

Never trust client-side authorization.

---

# 11. Finance Architecture

Modules

- Billing Rules
- Billing Generation
- Billing Exemptions
- Payments
- Official Receipts
- Statement of Account

Current Principle

One Billing Engine

One Balance Engine

One Payment Engine

No duplicated financial logic.

---

# 12. Billing Engine

Responsibilities

- Generate Bills
- Prevent Duplicates
- Apply Billing Rules
- Apply Exemptions
- Update Balances

Generation Modes

- Individual
- Selected
- All Homeowners

Future

Scheduled Billing

---

# 13. Payment Engine

Responsibilities

- Record Payment
- Apply Payment
- Update Balance
- Generate Receipt

Future

Payment Gateway

Webhook Integration

---

# 14. Document Engine

Modules

- Certificates
- Templates
- Requests
- QR Verification

Future

Digital Signature

---

# 15. HRIS Architecture

Modules

- Attendance
- Payroll
- Leave
- Employee

Future

Recruitment

Performance

Training

---

# 16. AI Architecture (Future)

Planned AI Services

HOA AI Assistant

Finance AI

HR AI

Document AI

Community AI

Analytics AI

Rules

AI must always respect:

- Tenant Isolation
- User Permissions
- Data Privacy Act
- Role Based Access

AI must never expose another tenant's data.

---

# 17. Security Architecture

Authentication

Authorization

Validation

Audit Logging

Tenant Isolation

Secure Sessions

Encrypted Passwords

HTTPS

Future

API Keys

Rate Limiting

---

# 18. Audit Logging

Every critical transaction should record:

- User
- Tenant
- Timestamp
- Module
- Action
- Previous Value
- New Value

Examples

Billing

Payment

Receipt

Documents

User Management

---

# 19. Performance Strategy

Pagination

Search

Indexes

Caching

Lazy Loading

Optimized Queries

Database Transactions

Future

Redis Cache

---

# 20. Deployment Architecture

Development

Local Machine

↓

Git

↓

GitHub

↓

Hostinger

↓

Production

Deployment Flow

Developer

↓

Feature Branch

↓

Develop

↓

Main

↓

Production

---

# 21. Coding Principles

Single Source of Truth

Reuse Existing Services

No Duplicate Logic

Mobile First

Tenant First

Security First

AI Ready

---

# 22. Future Integrations

SMS

Email

GCash

Maya

Bank APIs

Google Maps

OCR

AI Services

Microsoft 365

---

# 23. Disaster Recovery

Daily Backup

Database Export

Rollback Strategy

Git Version Control

Deployment Rollback

---

# 24. Technology Stack

Frontend

Next.js

React

TypeScript

Backend

Next.js Server Actions

Database

MySQL

ORM

Prisma

Authentication

NextAuth

Hosting

Hostinger

Version Control

Git

GitHub

Development

VS Code

Codex

---

# 25. Architecture Principles

Every new feature must satisfy:

✓ Tenant Scoped

✓ Mobile Responsive

✓ Role Protected

✓ Auditable

✓ Configurable

✓ AI Ready

✓ Secure

✓ Reusable

---

# 26. Payment Transaction Architecture

Record Payment posts one financial transaction through the shared payment service:

1. Resolve the authenticated tenant and authorized actor.
2. Validate one payer, current bill balances, reference rules, amount, and idempotency key.
3. Allocate one tenant receipt number.
4. Create one `Payment` header.
5. Create one or more tenant-safe `PaymentAllocation` rows.
6. Recalculate every affected bill and write one transaction audit event.
7. Commit in one serializable Prisma transaction and redirect to `/receipts/payment/{paymentId}`.

Receipt preview, PDF, Active Payments, Registered Receipts, SOA, and reports count the Payment header once and use allocations for bill coverage. Voiding marks the complete payment transaction void, preserves allocation and receipt history, archives it once, and recalculates all covered bills atomically.

# Document History

| Version | Date | Description |
|----------|------|-------------|
| 1.0 | July 11, 2026 | Initial System Architecture |
| 1.1 | July 12, 2026 | Documented one Payment header with multiple bill allocations |

# 27. Executive Finance Reporting Architecture

`/admin/reports/dashboard`, `/admin/reports/dashboard/pdf`, and `/admin/reports/dashboard/docx` share `lib/services/finance-dashboard.ts` as their authoritative business-value source.

1. Server page or export resolves the authenticated user and tenant.
2. `requireFinanceDashboardAccess` validates the approved role and Billing/Reports entitlements; SUPER_ADMIN follows the existing platform bypass, while PLATFORM_ADMIN remains platform-console only.
3. The server parses and validates `from` and `to`; no tenant identifier is accepted from the URL or form.
4. Explicit tenant predicates are applied to all bill, payment, allocation, request, audit, homeowner, and settings reads.
5. Payment headers provide receipt counts and cash received; allocations provide applied amounts; their difference provides derived credit.
6. Screen and exports consume the same normalized data contract so date range and business values cannot drift.

Queries use pagination for large source sets, aggregate/group operations where supported, bounded recent activity, and one batched homeowner load to avoid N+1 access. Charts are lightweight HTML/CSS with accessible tables, avoiding a new client chart dependency.

Exports contain tenant branding, report metadata, KPI and reconciliation summaries, trend and breakdown tables, delinquency, prepared/approved sign-off, and page numbering where the format supports it. Internal database IDs are omitted.

Known constraints: DOCX page numbering depends on the viewer's field rendering; historical as-of reporting uses persisted payment and void timestamps plus current bill archival validity; Product Owner two-tenant UAT remains a release gate.

# Document History Addendum

| Version | Date | Description |
|----------|------|-------------|
| 1.2 | July 15, 2026 | Added shared tenant-scoped executive finance reporting and export architecture |

## 28. Sprint 5B Finance Professionalization Architecture

SOA browser print and SOA PDF are expected to consume `lib/services/statement-of-account.ts` as the shared tenant-safe view model. Browser and PDF renderers can differ in layout mechanics, but cannot introduce separate business values, section omissions, tenant branding fallbacks, or visible database-id-derived labels.

The Finance Dashboard continues to use `lib/services/finance-dashboard.ts` for page and export values. Recent Finance Activity filters are URL-backed and service-applied, with search/status/type/date filters returning page-bounded rows and preserving the main reporting period. The Top Delinquent Homeowners SOA action routes through the existing homeowner SOA route and passes only a return URL, never a client tenant id.

PDF and DOCX exports use the same report service values as the screen. Export layout should favor wrapped tables, right-aligned numeric values, internal-use footer text, and prepared/approved sign-off fields over unsupported chart objects.

No database migration is required for Sprint 5B. Product Owner UAT remains the gate before Bug #049 or Improvements #056-#058 are marked complete.

# Document History Addendum

| Version | Date | Description |
|----------|------|-------------|
| 1.3 | July 15, 2026 | Documented Sprint 5B SOA parity, activity filters, SOA link, and export presentation architecture |

## 29. Homeowner Mobile Shell Architecture

The homeowner portal uses a server-rendered, authenticated shell at `app/portal/layout.tsx`. The layout resolves the homeowner with `requireUser(Role.HOMEOWNER)`, loads tenant branding through `getAssociationSettings(user.tenantId)`, applies module entitlement checks through `getEnabledTenantModules(user.tenantId)`, and never accepts tenant identifiers from the client.

Mobile presentation is centralized in `components/portal-mobile-shell.tsx`:

1. `PortalMobileHeader` renders tenant logo/name, homeowner greeting, profile access, and chat notification access only when Chat is entitled.
2. `PortalBottomNavigation` provides Home, Payments, SOA, Documents, and More navigation with active-route and `aria-current` state.
3. Shared summary cards, quick-action tiles, section headers, empty/error/skeleton states, and mobile list rows keep portal pages consistent.
4. The existing `Sidebar` remains the desktop/tablet navigation and is hidden only for portal mobile layout usage.

The dashboard foundation uses `lib/services/statement-of-account.ts` for homeowner finance summary values. Additional previews are bounded, tenant-scoped reads for open bills, recent bills, payment requests, document requests, announcements, events, and refundable bonds. `/portal/soa` consumes the same SOA service to avoid duplicate statement calculations.

PWA support is limited to neutral HOAHub manifest metadata. No service worker or offline cache is introduced for authenticated homeowner finance data. Offline behavior, push notifications, and richer app-install polish are deferred to Sprint 6B.

Security constraints:

- Tenant ID comes from the authenticated session and homeowner profile only.
- Module entitlements filter navigation and quick actions.
- Homeowner ownership checks continue through `requireHomeownerProfile`.
- Finance calculations, payment posting, receipt generation, billing generation, and SOA service calculations are unchanged.

# Document History Addendum

| Version | Date | Description |
|----------|------|-------------|
| 1.4 | July 15, 2026 | Documented Sprint 6A homeowner mobile shell, shared components, PWA foundation, and security constraints |
