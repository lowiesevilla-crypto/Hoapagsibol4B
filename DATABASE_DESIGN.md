# HOAHub Database Design

**Product:** HOAHub – Multi-Tenant Digital Community Management Platform

**Version:** 1.0

**Last Updated:** July 11, 2026

**Document Owner:** Lowie M. Sevilla

---

# 1. Purpose

This document describes the logical database design of HOAHub.

It serves as the primary reference for:

- Database Development
- Prisma Schema
- Future Migrations
- AI Development
- Reporting
- System Integration

---

# 2. Database Technology

Database Engine

MySQL

ORM

Prisma ORM

Architecture

Shared Database

Shared Schema

Tenant Isolation

Every business table contains:

tenantId

No business data may exist without a tenant.

---

# 3. Database Design Principles

Every table must follow these principles.

✓ Tenant Scoped

✓ Auditable

✓ Indexed

✓ Normalized

✓ Configurable

✓ AI Ready

✓ Secure

---

# 4. Core Platform Tables

## Tenant

Purpose

Represents one HOA organization.

---

# Sprint 6A Addendum - Document Workflow Architecture

Migration `20260715120000_document_architecture_migration` adds tenant-scoped document workflow tables without deleting or rewriting historical requests.

New models:

- `HouseholdMember`: tenant/homeowner composite ownership for registered family or household members.
- `DocumentTypeConfiguration`: one tenant-owned catalog entry per supported `DocumentType`, with delivery mode, fee, approval/payment flags, validity, copy limits, template, signatory, and version.
- `DocumentFieldConfiguration`: tenant-safe child fields for each document type configuration.
- `DocumentRequestEditAudit`: field-level admin review audit for document-visible changes.

`DocumentRequest` now stores immutable request context:

- configuration and template version snapshots
- `subjectType` and optional tenant-owned `subjectMemberId`
- `subjectSnapshot`, `requestDataSnapshot`, and `reviewedDataSnapshot`
- delivery, approval, payment, fee, copy, issue-date, and ready-for-download snapshots

Legacy status `GENERATED` is retained for compatibility. New generation workflows use `READY_FOR_DOWNLOAD`.

Stores

- HOA Name
- Branding
- Logo
- Address
- Contact Details
- Subscription
- Status

Relationships

Tenant

↓

Users

↓

Homeowners

↓

Finance

↓

Documents

---

## User

Purpose

System Login Account

Stores

- Username
- Email
- Password
- Role
- Status

Relationship

Tenant

↓

User

↓

Permissions

---

## Role

Purpose

Role Based Access Control

Examples

SUPER_ADMIN

HOA_ADMIN

FINANCE

PAYROLL_MANAGER

HOMEOWNER

EMPLOYEE

SECURITY

---

# 5. Homeowner Module

## Homeowner

Purpose

Stores homeowner profile.

Fields

- Name
- Contact
- Email
- Status
- Tenant

Future

Multiple Property Support

---

## Property

Purpose

Represents one property.

Fields

- Block
- Lot
- Address
- Ownership Type
- Status

Future

One Homeowner

↓

Multiple Properties

---

## Household

Purpose

Stores occupants.

Future

- Family Members
- Tenants
- Occupants
- Emergency Contacts

---

# 6. Finance Module

## Bill

Purpose

Represents one billing transaction.

Examples

Monthly Dues

Construction Bond

Security Fee

Maintenance Fee

Garbage Fee

Stores

- Amount
- Coverage Month
- Coverage Year
- Status
- Billing Rule
- Resolution Reference

---

## BillingRule

Purpose

Defines recurring billing.

Stores

- Amount
- Frequency
- Effective Period
- Resolution Reference
- Penalty

Supports

Manual

Automatic (Future)

---

## DuesExemption

Purpose

Exempts homeowners.

Stores

- Effective Period
- Reason
- Approval
- Resolution

---

## Payment

Purpose

Records payment.

Stores

- Amount
- Method
- Reference Number
- Date
- Collector

Future

Webhook Integration

---

## OfficialReceipt

Purpose

Official Acknowledgement Receipt.

Stores

- OR Number
- Receipt Type
- Collector
- Signature
- Payment Link

---

## StatementOfAccount

Generated

Not stored as a permanent transaction.

Built from

Bills

Payments

Adjustments

Credits

---

# 7. Document Module

## DocumentRequest

Purpose

Tracks requests.

Examples

Certificate

Clearance

Residency

Good Standing

---

## DocumentTemplate

Purpose

Stores templates.

Future

Dynamic Template Builder

---

# 8. Community Module

## Announcement

Purpose

Community announcements.

---

## Event

Purpose

Community events.

---

## Complaint

Purpose

Complaint Management.

---

## Vehicle

Purpose

Vehicle Registration.

---

## Visitor

Purpose

Visitor Records.

---

## GatePass

Purpose

Gate Pass.

---

# 9. HRIS Module

## Employee

Purpose

Employee Profile.

---

## Attendance

Purpose

Daily attendance.

---

## Schedule

Purpose

Work Schedule.

---

## Payroll

Purpose

Payroll Computation.

---

## Leave

Purpose

Leave Requests.

---

## Loan

Purpose

Employee Loans.

---

## CashAdvance

Purpose

Cash Advance.

---

# 10. Audit Module

## AuditLog

Purpose

Tracks system changes.

Stores

- User
- Tenant
- Module
- Action
- Previous Value
- New Value
- Timestamp

---

# 11. AI Module (Future)

## AIConversation

Purpose

Stores AI conversation history.

---

## AIKnowledge

Purpose

Indexed HOA documents.

---

## AIAudit

Purpose

Tracks AI actions.

---

# 12. Relationships

Tenant

↓

Users

↓

Roles

↓

Homeowners

↓

Properties

↓

Bills

↓

Payments

↓

Receipts

↓

SOA

---

# 13. Primary Keys

Every table

Uses UUID/String ID generated by Prisma.

---

# 14. Foreign Keys

Examples

Bill

↓

Homeowner

↓

Tenant

↓

BillingRule

Payment

↓

Bill

↓

Homeowner

↓

Tenant

Receipt

↓

Payment

↓

Tenant

---

# 15. Required Indexes

Examples

tenantId

homeownerId

billingMonth

coverageMonth

coverageYear

status

createdAt

updatedAt

Search Fields

Name

Email

Block

Lot

Reference Number

Receipt Number

---

# 16. Multi-Tenant Rules

Every query

Must filter

tenantId

Never expose another tenant.

Never trust tenantId from client input.

Always resolve tenant from authenticated session.

---

# 17. Audit Requirements

Every critical transaction

Must record

- User
- Tenant
- Timestamp
- Action

Examples

Billing

Payment

Receipt

Document

Employee

Payroll

Settings

---

# 18. Future Tables

Planned

Subscription

Invoices

Webhook

Notification

AI Usage

SMS Queue

Email Queue

Reports

Analytics

Community Voting

Marketplace

Facilities

Reservations

Inventory

Assets

Maintenance

Contractors

Projects

Budgets

Board Resolutions

Meeting Minutes

Election

Visitor QR

Vehicle Stickers

---

# 19. Database Standards

Use Prisma ORM.

Avoid raw SQL unless required.

Use Transactions.

Never duplicate financial data.

Store immutable financial records.

Soft Delete where appropriate.

Never cascade delete financial transactions.

---

# 20. Migration Strategy

All schema changes

Must use Prisma Migrations.

Never modify production schema manually.

Always validate

Prisma Validate

↓

Prisma Generate

↓

Typecheck

↓

Build

↓

UAT

↓

Merge

↓

Production

---

# 21. Payment Header and Allocation Model

`Payment` is the transaction header and Official Receipt entity. It stores one tenant, payer, total amount, payment method, reference, collector, transaction date, and receipt number. New multi-bill payments do not rely on the nullable legacy `Payment.billId` field.

`PaymentAllocation` stores the bill-level application of that payment:

- tenantId
- paymentId
- billId
- allocated amount
- coverage year, month, and label

The allocation table enforces one row per payment/bill pair and composite tenant-safe foreign keys to `Payment` and `Bill`. Application validation requires the allocation sum to equal `Payment.amount`.

Migration `20260712150000_payment_allocations_single_receipt` made `Payment.billId` nullable, added the tenant-scoped idempotency key and allocation table, and backfilled one allocation for every historical payment with a bill. Historical payment IDs, amounts, batches, and receipt numbers were not changed or consolidated.

# 22. Document History

| Version | Date | Description |
|----------|------|-------------|
| 1.0 | July 11, 2026 | Initial Database Design |
| 1.1 | July 12, 2026 | Added Payment header and tenant-safe PaymentAllocation architecture |
## Enterprise Document Definition Migration

### Decision

The current `DocumentType` enum architecture is retained temporarily for backward compatibility but will no longer be the primary source of document behavior.

A new tenant-owned `DocumentDefinition` aggregate will become the authoritative model for future document configuration and processing.

### Migration Strategy

The migration must be additive and phased:

1. Add new definition, template-version, numbering, and verification models.
2. Create one definition for every existing tenant and legacy document type.
3. Link existing configurations and templates to their definitions.
4. Link existing requests where ownership can be determined safely.
5. Preserve all legacy enum fields and historical snapshots.
6. Move new requests and generation workflows to `definitionId`.
7. Remove legacy enum dependencies only in a future cleanup release.

No existing document number, generated document, request snapshot, template snapshot, or workflow outcome may be rewritten.

### New Models

- `DocumentDefinition`
- `DocumentDefinitionField`
- `DocumentTemplateSet`
- `DocumentTemplateVersion`
- `DocumentDefinitionCounter`
- `DocumentVerificationToken`

### Compatibility

Existing records remain readable through legacy fields and immutable snapshots.

New records use tenant-owned definitions and published template versions.
