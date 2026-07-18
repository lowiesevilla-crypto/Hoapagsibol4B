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

Migration `20260716120000_document_definition_compatibility_schema` implements this additive compatibility foundation. It does not remove enum fields, rewrite generated documents, renumber documents, or alter historical request/generated snapshots.

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

### Local Backfill Verification

Local development backfill created 32 tenant/legacy-type definitions, 132 definition fields, 9 template sets, 9 published template versions, linked 32 configurations, linked 2 requests, and linked 1 generated document version. Cross-tenant compatibility checks returned no mismatches.

## Sprint 6B-1B Nullable Document Request Type

Migration `20260716174058_nullable_document_request_type` makes `DocumentRequest.type` nullable for custom tenant-owned document definitions. The legacy `DocumentType` enum remains available and existing historical request rows keep their original enum values.

Compatibility rules:

- Legacy-backed requests continue to store `DocumentRequest.type`.
- Custom definition-backed requests store `definitionId` as the authoritative reference and may store `type = null`.
- Definition, template version, request data, and subject snapshots remain immutable at submission/generation time.
- Custom definition numbering uses `DocumentDefinitionCounter`; legacy numbering continues to use `DocumentCounter`.
- Historical generated content and document numbers are not rewritten.

Local verification after applying the migration preserved request count `2`, generated-content fingerprint `120b4b0526a4fc425ac961f7563279858d2ed75839c4432ab67e60f645e8ac84`, and document-number fingerprint `00a72e70fa81e3d02226fe9d213f0e7b0c7d23dad7fa240f8501c2c60a7920a7`.

## Document Generation Lifecycle

Migration `20260718210000_document_generation_engine` adds `DocumentGenerationAttempt` and additive immutable generation metadata to `DocumentVersion`.

`DocumentGenerationAttempt` is tenant/request scoped and records mode, deterministic state, idempotency key, attempt number, timestamps, safe failure data, output format, correlation ID, renderer metadata, actor, and resulting version. Composite foreign keys reinforce tenant ownership for requests, versions, and actors. Unique tenant/request/mode/key and tenant/version constraints prevent retry duplication.

`DocumentVersion` now records generation mode, native output format and content type, output size, renderer identity, capabilities, policy/workflow/resolved-data snapshots, correlation and idempotency values, and template lineage. Existing generated content, numbers, verification codes, and historical snapshots are unchanged. No legacy columns or enums were removed.

Recovery note: take a database backup before rollout and deploy the matching application and migration together. Because the migration is additive, application rollback can continue reading legacy `DocumentVersion` fields. Do not drop `DocumentGenerationAttempt` or the added snapshot columns after any Milestone 3 issuance; they become part of the audit and immutable-document record. In a pre-issuance local failure only, restore the backup or remove the additive objects using reviewed SQL after confirming the attempt table is empty.

## Certificate of Residency Lifecycle Additivity

Migration `20260718230000_certificate_residency_reference` adds `RETURNED_FOR_CORRECTION` to the existing request/history status enum and `DOCUMENT_REISSUED` to the existing notification enum. It creates no table, drops no column/value, and rewrites no historical row. Certificate definitions, fields, template lineage, policies, workflow, numbering, issued versions, and tokens use existing Milestone 1-3 models. Rollback should restore a pre-migration backup only after confirming no row uses either new enum value; production migration is outside Milestone 4.
