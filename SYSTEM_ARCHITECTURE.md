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
