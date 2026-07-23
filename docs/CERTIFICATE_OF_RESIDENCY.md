# Certificate of Residency Reference Implementation

## Identity and Purpose

- Stable code: `CERTIFICATE_OF_RESIDENCY`
- Display name: Certificate of Residency
- Category: Official HOA Certification
- Purpose: certify that a verified homeowner or authorized resident has an active relationship to a tenant-owned property.

Display text is not used as an identifier. Legacy `DocumentType.CERTIFICATE_OF_RESIDENCY` remains mapped for historical compatibility.

## Generic Platform Behavior

The implementation reuses `DocumentDefinition`, dynamic fields, template sets and immutable versions, capability resolution, policy evaluation, workflow history, tenant-definition numbering, the generation orchestrator, HTML renderer, immutable `DocumentVersion`, hashed verification tokens, audit events, notifications, and release service.

`PREVIEW` and `VALIDATE` do not consume a number or create an issued version/token. `ISSUE` captures the exact published template, definition/capability/policy/workflow/resolved-data snapshots, HTML, SHA-256 hash, number, and opaque verification token. `REISSUE` creates a new number and lineage record. Release never regenerates output. Download returns the exact released immutable HTML.

## Certificate Configuration

The controlled provisioning service creates missing configuration only for an explicitly selected tenant. Existing definitions, published templates, numbering settings, workflow assignments, policies, and tenant customizations are preserved.

Reference defaults:

- Homeowner and walk-in requests enabled
- Free plus tenant approval
- Office release required
- QR, download, print, reissue, and revocation enabled
- One copy by default
- `COR-{YYYY}-{SEQUENCE:6}` annual numbering
- Required `purpose`; optional `intendedRecipient` and `remarks`
- Explicit configured signatory required for official issue

Reference policies are active-resident and property-relationship blocking checks, a configurable nonblocking outstanding-balance check, and a disabled violation-status check. Existing HOA balance is not hardcoded in the Certificate handler.

## Certified Template and Placeholders

The HOAHub certified source is `CERTIFIED`, published, versioned, read-only, and identified by `HOAHUB:CERTIFICATE_OF_RESIDENCY`. A tenant receives an independent `TENANT` published baseline only when it has no usable published template. Clone and Restore Default create tenant drafts; neither operation mutates the certified source or historical output.

The A4 template contains tenant branding, formal certification text, verified subject/property data, purpose, issue date/place/number, configured signatory, QR verification, and footer. Optional logo, SEC, TIN, contact, residency status, and residency start date blocks disappear when unresolved. Required placeholders block official issuance. Template text, not the orchestrator, owns certificate wording.

Allowlisted keys use the existing lowercase namespaces: `tenant.*`, `document.*`, `subject.*`, `property.*`, `request.*`, `signatory.*`, `verification.*`, and `system.*`. These are compatibility equivalents of the business-facing Association, Homeowner/Resident, Property, Document, Officer, and System groups. Arbitrary traversal and executable expressions are rejected.

## Security and Privacy

Tenant and user identity come only from authenticated server context. Request, homeowner, property relationship, definition, template, officer, workflow, issued version, and download queries are tenant-first. Homeowners can act only on their own request and cannot approve, issue, release, reissue, revoke, or view another tenant's records.

Public verification shows only validity state, document type/number, issue date, validity date, and association. It is rate-limited, `noindex`, and never returns resident name, property, contact, balance, approval data, IDs, token, or token hash. QR payloads contain only the opaque verification URL.

## State and Notifications

The request path is `PENDING_APPROVAL` -> `APPROVED` -> `GENERATED` -> `READY_FOR_DOWNLOAD`. `RETURNED_FOR_CORRECTION` may return to `UNDER_REVIEW`; rejection and cancellation are terminal request states. Issued-version status independently records `ISSUED`, `RELEASED`, or `REVOKED`.

Tenant-scoped idempotent notifications cover submitted, approval required, returned, approved, rejected, ready, released, reissued, and revoked events. Audit metadata excludes rendered content, raw tokens, contact data, balance amounts, and confidential request content.

## Local Provisioning

Run only against local MySQL:

```powershell
pnpm tsx scripts/provision-certificate-of-residency.ts --tenant=<tenant-slug>
```

The script rejects production mode, nonlocal databases, missing tenants, and tenants without an authorized administrator. It does not provision all tenants automatically.

## Product Owner UAT

1. Provision a clearly labeled local tenant and assign an active organization officer as the definition signatory.
2. Submit a homeowner Certificate request for self with a valid purpose.
3. Return it with correction remarks; confirm the homeowner sees and resubmits corrections.
4. Approve, preview, issue, and release from Document Management.
5. Confirm preview has a watermark and no number; issued output has a `COR-YYYY-######` number and QR.
6. Download and print from the homeowner portal; confirm the exact released HTML is used.
7. Open the QR URL and confirm only safe public metadata appears.
8. Reissue with a reason; confirm a new number and unchanged original.
9. Revoke a version; confirm public status is Revoked and download is blocked.
10. Attempt request, approval, release, and download from a second tenant; confirm rejection.

## Extension Lessons

Future document types should add configuration and templates, not type checks inside the orchestrator. Use explicit tenant provisioning, required-versus-optional template blocks, configured signatories, policy adapters, workflow history, immutable output, opaque verification, and exact-version download. Payment collection, attachment storage, and richer PDF/DOCX parity remain separate platform capabilities.
