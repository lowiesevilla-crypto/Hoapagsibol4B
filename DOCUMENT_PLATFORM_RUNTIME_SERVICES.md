# HOAHub Document Platform Runtime Services

## Scope

Milestone 2 adds the service layer underneath the existing document routes. It
does not add administrator screens, seed certified templates, issue individual
document types, or implement payment accounting.

## Runtime boundary

Every public service accepts `DocumentExecutionContext`, which is created from
the authenticated user. The context carries the authenticated user ID,
explicit tenant ID, role, platform flag, permissions, and correlation ID.
Service reads filter by that tenant ID. Cross-tenant relations are validated
before a base Prisma transaction is used for atomic writes. Client-supplied
tenant IDs are never used as authority.

## Service map

| Service | Responsibility |
| --- | --- |
| `document-runtime-context.ts` | Tenant, role, permission, and correlation boundary |
| `document-registry.ts` | Definition lookup, creation, status changes, capabilities |
| `document-capabilities.ts` | Explicit capability resolution from a definition |
| `document-template-runtime.ts` | Tenant template lifecycle, draft validation, publication, restore, comparison |
| `document-placeholders.ts` | Allowlisted placeholder catalog, validation, preview and generation resolution |
| `document-policies.ts` | Policy CRUD, assignment, and structured evaluation results |
| `document-workflows.ts` | Workflow definition and step runtime using immutable request history |
| `document-approvals.ts` | Authorized approver lookup and approval/rejection wrappers |
| `document-numbering-runtime.ts` | Preview and atomic definition-counter allocation |
| `document-verification.ts` | Hashed verification tokens, safe public projection, revoke and rotate |
| `document-notifications.ts` | Idempotent in-app document notification events |
| `document-runtime-audit.ts` | Redacted tenant-scoped audit events |

## Template lifecycle

Certified template sets remain read-only. A tenant may clone a certified
version or create a custom set. Draft versions are validated before saving and
publishing. Publishing retires the previous published version, marks the new
version immutable, and assigns it to the same-tenant definition in one
transaction. Historical versions and issued-document snapshots are not
rewritten.

## Placeholder contract

Placeholders are allowlisted by namespace. Preview uses documented sample
values. Generation resolves only explicit context fields or registered custom
resolvers and leaves missing values visible for operator review. Sensitive
placeholders require an explicit permission. No expression evaluation,
arbitrary HTML, scripts, or database-ID QR payloads are permitted.

## Policy contract

Policies use typed records for searchable fields and validated JSON only for
parameters. Outstanding balance evaluation delegates to the existing
authoritative balance service. Membership evaluation reads the tenant-owned
homeowner profile. Other policy types return a structured `SKIPPED` result
until a dedicated evaluator is approved; they do not silently pass.

## Workflow and approval contract

The existing `DocumentRequestHistory` table is the runtime approval history.
Workflow start records the configured workflow version and step. Decisions,
remarks, acting role, and override metadata are written atomically with status
changes. Sequential and parallel progression are derived from immutable
history, avoiding a duplicate runtime-instance model.

## Numbering contract

Definition numbering uses the existing tenant-and-definition scoped
`DocumentDefinitionCounter`. Annual and continuous scopes use separate counter
keys. Preview never consumes a number. Allocation increments the counter in
the caller's transaction. Legacy enum numbering remains available through its
existing adapter and is not replaced by this milestone.

## Verification and notifications

New verification tokens store SHA-256 hashes of cryptographically random raw
tokens. Raw tokens are returned only at creation or rotation. Public lookup
returns only tenant name, document number/type, issue/validity dates, and
validity state. Legacy `verificationCode` routes remain unchanged. Document
notifications are in-app `NotificationLog` records with tenant-safe entity
metadata and deterministic event keys, so retries do not duplicate events.

## Compatibility and deferred work

Existing document actions, legacy enum requests, legacy verification routes,
balance policy resolution, and document generation remain the sources of truth
until a later migration explicitly adopts these adapters. Deferred work is
administrator UI integration, certified-template seeding, runtime payment
settlement, release acknowledgement, public verification UI, richer policy
evaluators, and the Sprint 3 document experience.
