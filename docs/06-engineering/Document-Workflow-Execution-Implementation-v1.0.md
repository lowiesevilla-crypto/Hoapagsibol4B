# Document Workflow Execution Implementation v1.0

## Scope

This implementation completes the reusable document workflow execution layer for tenant-owned DocumentDefinition records. It preserves the accepted template editor, visual designer, placeholder handling, preview behavior, and renderer contracts.

Out of scope: document fee accounting beyond payment request and collection linkage, walk-in payment cashiering, release acknowledgment reconstruction, public QR page redesign, template editor redesign, deployment, merge, and push.

## Root Cause

The document module had several partially independent lifecycle paths. Homeowner requests, admin approvals, document payment requests, certificate lifecycle actions, and official generation each advanced status independently. That allowed contradictory outcomes such as paid documents becoming downloadable before a document fee was approved, approved documents requiring a separate manual issue step, and free instant documents being blocked by unrelated payment flags.

## Reused Functionality

- Existing DocumentDefinition, DocumentDefinitionField, DocumentTemplateSet, and DocumentTemplateVersion architecture.
- Existing document generation service and deterministic renderer.
- Existing preview behavior using PREVIEW document number.
- Existing verification token and QR preview foundation.
- Existing PaymentRequest review workflow and Collection receipt numbering.
- Existing DocumentRuntimeContext authorization model.
- Existing document request history and audit log patterns.
- Existing balance-policy authorization resolver.

## New Workflow Executor

Authoritative service: `lib/services/document-workflow-executor.ts`.

Main entry points:

- `executeDocumentWorkflowAfterSubmission(context, requestId)`
- `advanceDocumentWorkflowAfterPayment(context, requestId)`
- `approveDocumentWorkflowRequest(context, requestId, options)`
- `paymentConfirmedByStatus(status)`

The executor always loads the request by authenticated tenant context and validates linked homeowner, subject, definition, template, and household member ownership before changing status.

## Status Transition Table

| Workflow | Submission Result | After Payment | After Approval | Final Official State |
| --- | --- | --- | --- | --- |
| Free + Instant | GENERATING | Not required | Not required | ISSUED |
| Free + Approval | PENDING_APPROVAL | Not required | APPROVED then GENERATING | ISSUED |
| Paid + Instant | PENDING_PAYMENT | PAYMENT_CONFIRMED then GENERATING | Not required | ISSUED |
| Paid + Approval | PENDING_PAYMENT | PAYMENT_CONFIRMED then PENDING_APPROVAL | APPROVED then GENERATING | ISSUED |
| Request Only | SUBMITTED | Not automatic | Not automatic | Manual processing |

Legacy status values remain available for backward compatibility.

## Payment Integration

Paid document workflows create exactly one tenant-scoped `PaymentRequest` with `type = DOCUMENT_FEE` linked to the `DocumentRequest`.

When the document-fee PaymentRequest is approved:

- an official collection receipt is allocated through the existing receipt-number service;
- a Collection row is created with `CollectionType.OTHER`;
- the PaymentRequest is linked to that Collection;
- the DocumentRequest advances to `PAYMENT_CONFIRMED`;
- the executor continues the workflow based on approval requirements.

No document-specific unpaid fee is treated as the same thing as the homeowner's existing HOA balance.

## Approval Enforcement

Document approval requires `APPROVE_REQUESTS`. If a configured workflow step names an approver user or approver role, the executor enforces that configuration before approval.

Workflow approval history is recorded for configured required steps, and document request history/audit events are recorded for request-level transitions.

## Household Member Validation

Household-member subjects must:

- belong to the authenticated tenant;
- belong to the owning homeowner account;
- be active;
- have `validatedAt`;
- not have `revokedAt`.

Invalid, inactive, unvalidated, revoked, cross-tenant, or cross-homeowner household member subjects are rejected before official issuance.

## Official Generation

Official issuance uses the existing generation engine with an idempotency key of `workflow:issue:{requestId}`. Preview remains side-effect free and does not allocate official document numbers, issued versions, verification tokens, payment requests, receipts, or collections.

If generation fails after a request enters `GENERATING`, the executor restores the previous workflow status and records failure history/audit so the request remains retryable.

## QR Verification Rules

The verification service now classifies:

- valid tokens as `VALID`;
- expired tokens as `EXPIRED`;
- revoked tokens as `REVOKED`;
- superseded document versions as `SUPERSEDED`;
- missing or invalid public codes as `NOT_FOUND`.

The public verification page does not expose private homeowner, payment, audit, or internal database details.

## Two-Copy A4 Pass Output

Gate/move pass print and PDF output now render exactly two A4 pass copies:

- `HOA OFFICE COPY`
- `HOMEOWNER COPY`

Preview and official rendering paths remain otherwise unchanged.

## Tenant Isolation

All executor writes use authenticated tenant context. Cross-tenant approvals, household member access, template access, and payment request linkage are rejected by service-level ownership checks and database relations.

## Known Limits

- Full document-fee accounting beyond approved PaymentRequest and Collection receipt linkage remains deferred.
- Request-only lifecycle remains manual.
- Release acknowledgment reconstruction remains deferred.
- Public QR verification UI expansion remains deferred.
