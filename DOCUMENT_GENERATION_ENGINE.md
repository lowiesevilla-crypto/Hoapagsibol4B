# Document Generation Engine

## Purpose

The Document Generation Engine is the reusable, tenant-safe coordinator that transforms an eligible `DocumentRequest` into an immutable `DocumentVersion`. It consumes the Document Platform services introduced in Milestones 1 and 2 and contains no document-type branches.

The authoritative entry points are:

- `generateDocument(context, requestId, options)` for `PREVIEW`, `VALIDATE`, `ISSUE`, and `REISSUE`.
- `releaseIssuedDocument(context, input)` for office release without regeneration.
- `getIssuedDocument(context, documentVersionId)` for tenant- and owner-scoped retrieval.

Legacy generation in `lib/actions/documents.ts` remains functional as a compatibility path. Existing routes are not migrated automatically in Milestone 3.

## Pipeline

```mermaid
sequenceDiagram
    actor Actor as "Authorized user"
    participant Engine as "Generation orchestrator"
    participant Registry as "Registry and capabilities"
    participant Policy as "Policy service"
    participant Workflow as "Workflow service"
    participant Template as "Template runtime"
    participant Merge as "Placeholder and render model"
    participant Renderer as "HTML renderer"
    participant Numbering as "Numbering service"
    participant Verify as "Verification service"
    participant Store as "DocumentVersion store"
    participant Audit as "Audit and notification"

    Actor->>Engine: mode, request ID, idempotency key
    Engine->>Registry: resolve tenant definition and capabilities
    Engine->>Policy: evaluate assigned policies
    Engine->>Workflow: confirm workflow and approvals
    Engine->>Template: resolve exact published version
    Engine->>Merge: resolve allowlisted placeholders
    Engine->>Renderer: validate renderer-neutral model
    alt PREVIEW
        Renderer-->>Actor: watermarked HTML, no number or token
    else VALIDATE
        Engine-->>Actor: structured readiness issues and warnings
    else ISSUE or REISSUE
        Engine->>Numbering: allocate inside final transaction
        Engine->>Verify: prepare URL and persist token hash
        Engine->>Renderer: render final numbered HTML with QR
        Engine->>Store: create immutable version and snapshots
        Engine->>Audit: record lifecycle events atomically
        Engine-->>Actor: issued result
        Engine->>Audit: create idempotent notification after commit
    end
```

## Generation Modes

### PREVIEW

- Resolves the trusted request, definition, policy, template, and placeholders.
- Allows an explicitly selected draft only for users with template-management permission.
- Returns native HTML with a visible `PREVIEW - NOT AN OFFICIAL DOCUMENT` watermark.
- Does not create a generation attempt, number, token, `DocumentVersion`, or release state.

### VALIDATE

- Evaluates official-issuance readiness, including payment, approval, workflow, template, placeholder, and renderer validation.
- Returns structured issues with code, domain, severity, blocking state, safe message, and remediation.
- Uses a non-secret pending verification URL to validate QR placeholders without creating a token.
- Does not render official output or consume a number.

### ISSUE

- Requires an idempotency key and all official readiness checks.
- Claims a tenant/request/mode/key generation attempt.
- Allocates one number and creates one immutable `DocumentVersion` in the final transaction.
- Creates a hashed verification token when QR is enabled.
- Rejects a request with an existing official version; callers must use `REISSUE`.

### REISSUE

- Requires reissue capability, permission, an existing version, and a non-empty reason.
- Allocates a new number and creates a new immutable version.
- Stores `reissueOfId`; the original number, content, snapshots, token history, and hash are not changed.

## State Model

`DocumentGenerationAttempt` uses `DocumentGenerationState`:

`NOT_STARTED`, `VALIDATING`, `BLOCKED`, `READY`, `RENDERING`, `GENERATED`, `ISSUED`, `RELEASE_PENDING`, `RELEASED`, `FAILED`, `REVOKED`, and `REISSUED`.

Attempts retain the safe failure code/message, attempt number, correlation ID, renderer metadata, output format, actor, and resulting version. Failed attempts can be retried with the same idempotency key. Successful attempts replay their existing immutable version.

## Eligibility and Authorization

All reads start with `DocumentExecutionContext.tenantId`; no input accepts a client tenant ID. The engine validates request, homeowner, subject member, definition, template, workflow, policy, and actor ownership.

Role permissions cover preview, validation, issue, reissue, release, issued-document view, history view, and retry. A homeowner may reach official ISSUE only when the request is their own and the effective definition explicitly allows immediate download with no payment or approval requirement. Draft preview remains an administrator permission.

Attachments are not modeled by the current Document Platform and `supportsAttachments` remains false. Attachment validation is therefore deferred rather than represented through a parallel JSON convention.

## Template and Placeholder Security

Official modes use only a captured published/retired request version or a current same-tenant published version. Editable drafts are never accepted for official output. Published rows are read only during generation.

The template parser supports allowlisted blocks and placeholders only. Placeholder resolution does not perform property traversal, SQL, arbitrary expressions, JavaScript, or raw HTML execution. The native HTML renderer escapes text and attributes, restricts fonts, clamps numeric styles, and accepts only normalized template definitions.

Generation snapshots recursively redact keys matching credentials, secrets, tokens, hashes, government identifiers, private notes, and violation details. Public verification uses a separate projection containing only organization, document type, number, status, and issue date.

## Renderer Model and Formats

`DocumentRenderModel` is renderer-neutral and serializable. It contains metadata, normalized page settings, header/body/footer blocks, resolved values, unresolved and unauthorized placeholder sets, warnings, locale, mode, and renderer version.

`DocumentRenderer` exposes name, version, output format, validation, and asynchronous rendering. Milestone 3 natively supports:

- Native output: safe HTML.
- Printable output: browser print CSS over the immutable HTML.
- Download compatibility: existing document-specific PDF routes remain legacy and functional.
- Deferred: generic PDF, DOCX, external storage, and exact desktop-publishing pagination.

The HTML renderer uses the existing lightweight `qrcode` package for QR data URLs. It does not use browser automation.

## Output and Immutable Snapshots

The existing database content approach remains authoritative. `DocumentVersion.generatedContent` stores immutable HTML, and the row records content type, byte size, SHA-256 content hash, output format, renderer name/version, template set/version, source version, definition/capability snapshot, policy summary, workflow summary, resolved-data snapshot, correlation ID, idempotency key, number, actor, dates, status, and reissue lineage.

The current `DocumentRequest` receives compatibility fields for current status and routes, but historical reconstruction must use `DocumentVersion`. Normal services do not update issued content, number, template, or generation snapshots. Release changes status and release metadata only.

## Numbering, Verification, and Transactions

PREVIEW and VALIDATE never call the allocation service. ISSUE and REISSUE allocate through the existing tenant-definition counter inside the final Prisma transaction.

The engine first validates and builds a preliminary model outside the transaction. For QR-enabled issuance, it generates a cryptographically random token in memory and passes only the canonical verification URL to the renderer. The final transaction then:

1. Rechecks request existence and critical status.
2. Confirms no prior ISSUE won concurrently.
3. Marks the attempt as rendering.
4. Allocates the number.
5. Builds and renders the final numbered HTML and QR.
6. Computes SHA-256.
7. Creates `DocumentVersion` and persists only the verification token hash.
8. Updates the request and history.
9. Links the attempt and writes critical audit events.

Final HTML rendering is deterministic and bounded, so it remains inside this short transaction to guarantee the exact numbered/QR output is hashed and committed atomically. Any failure rolls back the counter, token, version, request state, and critical events. External rendering and storage are deferred and must use a future reservation/finalization design.

## Idempotency and Concurrency

The database uniquely claims `(tenantId, requestId, mode, idempotencyKey)` and links at most one attempt to one version. Repeating a successful key returns the existing version. A failed key increments `attemptNumber` and can retry safely.

Concurrent ISSUE operations are also protected by the request version recheck and the existing unique `(requestId, version)` constraint. A losing transaction rolls back its counter increment and token. Notification event keys include the immutable version ID, preventing retry duplicates while allowing a later reissue notification.

## Release and Failure Recovery

Definitions that require office release create an issued version in `RELEASE_PENDING`. `releaseIssuedDocument` validates permission and tenant ownership, rejects revoked or missing output, records `releasedAt` and `releasedById`, updates the request to `READY_FOR_DOWNLOAD`, writes history/audit, and notifies the owner. Repeated release is idempotent and never regenerates content.

Failures are mapped to typed safe codes covering authorization, capabilities, request completeness, attachments, policy, workflow, approval, templates, placeholders, rendering, numbering, verification, snapshots, duplicate issuance, concurrency, release, storage, and internal failure. Rendered output and raw tokens are not written to errors, audit metadata, or notifications.

## Legacy Compatibility

- `processDocumentRequestAction` and existing instant generation remain functional.
- Existing `DocumentVersion`, request snapshots, verification codes, PDF, print, and download routes remain readable.
- New engine versions also store the legacy verification code needed by current routes, while the QR uses the secure hashed-token architecture.
- No existing route is silently moved to the new engine in Milestone 3.

## Extending for a Certified Document

Future certified-document work should seed a certified template and tenant clone, configure its definition/capabilities/policies/workflow/fields/numbering, and submit a definition-backed request. The orchestrator and renderer must remain unchanged. Document wording, attachments, special policy adapters, and output-specific layout belong in configuration or bounded domain adapters, never document-code conditionals in the engine.

Certificate of Residency wording, certified template seeding, generic PDF/DOCX, public verification UI, production email, external storage, and Admin UI integration are explicitly deferred.
