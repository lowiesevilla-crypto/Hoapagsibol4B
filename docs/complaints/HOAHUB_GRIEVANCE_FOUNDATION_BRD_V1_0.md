# HOAHub Complaint-to-Grievance Foundation BRD

**Document version:** 1.0  
**Date:** 2026-08-17  
**Business status:** APPROVED FOR IMPLEMENTATION PLANNING  
**Implementation status:** NOT STARTED  
**Deployment status:** NOT DEPLOYED  
**Owner:** HOAHub Product / Technology  
**Related module:** Complaint Management  
**Target delivery:** Phase 1 — Anonymous Two-Way Messaging + Grievance Foundation

---

## 1. Purpose

This Business Requirements Document defines the first controlled extension of HOAHub Complaint Management from a complaint/ticket intake workflow into an HOA-specific grievance and compliance foundation.

The design intentionally preserves the existing complaint subsystem as the intake and operational case layer. Formal grievance, verification, due-process, hearing, board-review, enforcement, and appeal capabilities must evolve as a separate domain rather than expanding `ComplaintStatus` into a single oversized legal workflow.

Phase 1 focuses on the highest-value foundation:

1. secure two-way anonymous complaint messaging;
2. explicit complaint subject/property identification;
3. independent verification controls before punitive enforcement;
4. grievance committee membership and scoped permissions;
5. process/legal deadlines separated from operational SLAs;
6. an additive grievance-case foundation that future phases can extend without breaking existing complaint behavior.

This BRD is a product and engineering specification. It must not be treated as legal advice or as a hard-coded statement that every HOA follows the same statutory timeline. Tenant bylaws, policies, and applicable law remain configurable policy inputs.

---

## 2. Current-State Baseline

The existing HOAHub Complaint Management module already provides:

- multi-tenant complaint isolation;
- named, confidential, and anonymous complaint intake;
- bcrypt-hashed anonymous PIN credentials;
- anonymous tracking code + PIN lookup;
- separate confidential identity storage;
- controlled confidential-identity reveal with audit logging;
- complaint categories, severity, priority, assignment, status history, timeline, and reports;
- public and internal complaint messages;
- tenant-scoped complaint attachments;
- homeowner complaint history for named/confidential cases;
- anonymous tracking that exposes only public case information;
- operational resolution SLA calculation;
- complaint audit logs and no-store privacy controls.

Known Phase 1 drivers:

- homeowner complaint detail is effectively read-only;
- anonymous tracking is read-only;
- admins cannot ask an anonymous complainant follow-up questions and receive a response;
- complaints do not explicitly model the resident/property that is the subject of the allegation;
- anonymous or confidential allegations do not have a formal verification gate before punitive enforcement;
- committee membership and hearing-specific permissions are not modeled as HOA business appointments;
- operational SLA and respondent/process deadlines are not separate concepts;
- `ComplaintCategory.requiresBoardReview` does not yet drive a formal board-review workflow.

---

## 3. Product Principles

### 3.1 Complaint and Grievance are different domains

A `Complaint` answers: **What was reported?**

A future `GrievanceCase` answers: **What formal compliance/due-process proceeding resulted from the report?**

Phase 1 must preserve this separation even if the initial grievance record is minimal.

### 3.2 Allegation is not proof

Named, confidential, and anonymous complaints are allegations until verified according to tenant policy. The system must not treat complaint privacy mode as proof strength.

### 3.3 Anonymous means no identity linkage in the case domain

Anonymous messaging must not introduce `userId`, `homeownerId`, resident email, or other identity linkage into anonymous complaint messages or anonymous conversation sessions.

### 3.4 Enforcement requires explicit policy gates

When tenant policy requires independent verification, punitive/enforcement actions must fail closed until verification is satisfied.

### 3.5 Tenant policy must be configurable

HOA-specific timelines, verification rules, committee structure, board-review requirements, and process steps must be tenant-controlled where practical. The product must not hard-code a universal 5-day, 7-day, or similar legal grace period.

### 3.6 Mobile/PWA is a release requirement

Homeowner and anonymous tracking interactions must work safely on supported phone widths and installed PWA/mobile-browser contexts.

---

## 4. Scope

### 4.1 In Scope — Phase 1

- anonymous two-way text messaging using REST polling;
- short-lived anonymous complaint session after successful tracking-code/PIN authentication;
- reuse/extension of `ComplaintMessage` rather than a separate anonymous-chat silo;
- secure anonymous message posting by complainant;
- public admin questions/updates visible to anonymous complainant;
- complaint-subject model for homeowner/property/vehicle/common-area/unknown targets;
- structured Phase/Block/Lot or property relation where available;
- retention of free-text incident location;
- independent verification record and enforcement gate;
- configurable verification requirement based on category/privacy/policy;
- grievance committee membership model with scoped positions/permissions;
- separate process deadline records from complaint operational SLA;
- minimal `GrievanceCase` foundation sufficient to link a complaint to future formal proceedings;
- audit/timeline additions for new security-sensitive actions;
- tenant isolation and multi-role authorization tests;
- homeowner mobile/PWA acceptance coverage;
- Agent.md tracking of requirements, implementation status, validation, merge, and deployment.

### 4.2 Deferred — Phase 2

- notice of violation / notice to explain generation;
- proof of service;
- mediation scheduling;
- formal hearing scheduling;
- hearing participants/witnesses/exhibits;
- hearing minutes;
- board review, quorum, vote, abstention, and recusal;
- formal grievance decision;
- appeal/reconsideration workflow;
- advanced evidence vault and evidence provenance/chain records.

### 4.3 Deferred — Phase 3

- versioned resolution agreements and signatures;
- regulatory/adjudication case dossier PDF generation;
- configurable export profiles for Board, counsel, HSAC/DHSUD or other authorized destination;
- retention/legal hold automation;
- advanced redaction;
- complaint/grievance notification templates;
- full malware scanner integration;
- advanced compliance analytics.

### 4.4 Explicitly Out of Scope for Phase 1

- WebSocket infrastructure;
- typing indicators or online-presence indicators;
- anonymous file attachments in the messaging stream;
- public unauthenticated complaint submission;
- automatic disclosure of confidential complainant identity;
- automatic fines or penalties based only on an allegation;
- hard-coded legal timelines asserted to apply to every HOA;
- replacement of the existing Complaint Management module.

---

## 5. Target Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                    HOAHub COMPLAINT                          │
│ Intake │ Privacy │ Messaging │ Initial Evidence │ Subject   │
└──────────────────────────────┬───────────────────────────────┘
                               │
                     Requires formal action?
                               │
                 ┌─────────────┴──────────────┐
                 │ No                         │ Yes
                 ▼                            ▼
          Normal Resolution              GRIEVANCE CASE
                                              │
                                   Verification / Policy
                                              │
                                   Future Phase 2/3 flow
```

The initial `GrievanceCase` must be additive. Existing complaint routes and status transitions must continue to operate unless a documented Phase 1 enforcement gate explicitly applies.

---

# 6. Functional Requirements

## 6.1 Anonymous Two-Way Messaging

### ANM-001 — Anonymous conversation session

After a valid anonymous tracking code + PIN is verified, the server must create a short-lived anonymous complaint session rather than requiring the PIN on every polling request.

**Acceptance criteria:**

- PIN is used only to establish/re-establish the anonymous session.
- Session token is random and opaque.
- Browser receives the token only through a `HttpOnly`, `Secure` in production, appropriate `SameSite` cookie.
- Database stores only a one-way hash/digest of the anonymous session token.
- Session is scoped to exactly one tenant and one complaint.
- Session includes expiry, last-seen, and revocation state.
- Session record contains no `userId`, `homeownerId`, homeowner email, homeowner account number, or resident identity foreign key.

### ANM-002 — Anonymous session lifecycle

The system must support anonymous session creation, validation, expiry, explicit revocation/logout, and re-authentication.

**Acceptance criteria:**

- expired/revoked/missing sessions fail closed;
- tracking code + PIN can establish a new valid session subject to rate limits;
- logout/revoke immediately prevents further message reads/writes using the old session;
- session cleanup can be performed safely without changing complaint history.

### ANM-003 — REST polling transport

Phase 1 must use REST polling for anonymous message retrieval.

**Acceptance criteria:**

- client requests only messages newer than the last known cursor/message identifier;
- active view may poll approximately every 5 seconds;
- polling should back off after inactivity, for example to 10–15 seconds;
- polling pauses when the document/page is not visible where browser APIs permit;
- full message history is not re-downloaded on every poll;
- transport/business logic is separated so a future SSE/WebSocket reader can be introduced without replacing authorization/persistence rules.

### ANM-004 — Anonymous complainant reply

A valid anonymous session may create a text-only public complaint message.

**Acceptance criteria:**

- message body is plain text;
- recommended maximum is 2,000 characters;
- minimum non-whitespace content is enforced;
- no HTML rendering and no executable markup;
- no file attachment in Phase 1;
- anonymous message has no resident identity link;
- sender is represented as an anonymous complainant/system-safe display label;
- message creation creates the appropriate complaint timeline/audit event without deanonymizing the sender.

### ANM-005 — Admin public question/update

Authorized complaint handlers may post a public message/question that is visible in anonymous tracking.

**Acceptance criteria:**

- `PUBLIC` messages are returned to the anonymous complainant;
- `INTERNAL` and `CONFIDENTIAL` messages are never returned by anonymous APIs;
- existing admin internal-note behavior remains supported;
- admin identity exposed to the anonymous complainant is limited to approved display information such as `HOA Staff` or another tenant-safe label, not internal user IDs/emails unless explicitly approved later.

### ANM-006 — Message idempotency

Anonymous message creation must support a client-generated idempotency key such as `clientMessageId`.

**Acceptance criteria:**

- network retry does not create duplicate messages;
- idempotency is scoped to the anonymous session/complaint;
- malformed or reused conflicting IDs fail safely.

### ANM-007 — Anonymous message rate limiting

Anonymous session authentication and anonymous message posting must be rate-limited separately.

**Acceptance criteria:**

- existing tracking credential brute-force protection remains intact;
- message posting has a tenant/complaint/session-aware rate limit;
- rate-limit response does not reveal whether another tenant/case exists;
- repeated abuse cannot create unbounded message records.

### ANM-008 — No sensitive telemetry by default

Anonymous conversation functionality must not persist identity-reconstructing telemetry by default.

**Acceptance criteria:**

- raw PIN is never logged;
- raw anonymous session token is never logged;
- IP address and user agent are not stored as complaint-domain identity metadata unless a separately approved abuse/security policy is introduced;
- application errors must not echo secret session material.

### ANM-009 — Anonymous tracker UI

The anonymous tracking page must become a mobile-first conversation view after successful code/PIN authentication.

**Acceptance criteria:**

- existing case status/reference context remains visible;
- public message stream is readable in chronological order;
- anonymous complainant can send text replies;
- loading/new-message behavior is understandable without desktop-only interactions;
- current mobile `Back to Home` behavior remains available;
- primary composer/send control is touch safe and viewport safe;
- no horizontal overflow on supported phone widths.

---

## 6.2 Complaint Subject and Structured Property Target

### SUB-001 — Complaint subject entity

Introduce a `ComplaintSubject` concept instead of treating every complaint as having only a free-text location.

Recommended subject types:

- `HOMEOWNER`
- `PROPERTY`
- `VEHICLE`
- `COMMON_AREA`
- `UNKNOWN`

### SUB-002 — Multiple subjects

A complaint may have zero, one, or multiple subjects.

Example: a single noise complaint may concern two properties.

### SUB-003 — Structured HOA property reference

Where the tenant has a known property/homeowner record, the complaint intake/admin flow should allow linkage to a structured property reference.

Expected data may include:

- tenant property/homeowner foreign key where appropriate;
- phase snapshot;
- block snapshot;
- lot snapshot;
- address snapshot only where permitted for the authorized admin workflow.

### SUB-004 — Incident location remains separate

The existing free-text incident location must not be removed solely because a structured subject property exists.

The product must distinguish:

- **Subject property/person** — who/what the allegation concerns; and
- **Incident location** — where the event occurred.

### SUB-005 — Intake privacy

Homeowner intake must not become a tenant-wide resident directory exposing private resident data.

**Acceptance criteria:**

- homeowner-facing subject selection exposes only minimum approved identifiers;
- no private email/phone is shown for target selection;
- cross-tenant property/homeowner lookup is impossible;
- server verifies all submitted subject identifiers inside authenticated tenant scope.

### SUB-006 — Subject analytics readiness

The data model must support future authorized analytics such as complaint counts by property/subject while preserving complaint privacy rules.

Phase 1 does not require the complete analytics dashboard.

---

## 6.3 Independent Verification Gate

### VER-001 — Verification record

Introduce an additive complaint verification record capable of representing whether independent verification is required and its current result.

Recommended fields/concepts:

- `required`;
- `status`;
- `verificationType`;
- `findings`;
- `verifiedById`;
- `verifiedAt`;
- tenant ID and complaint ID;
- timestamps and audit linkage.

Suggested verification methods:

- `SITE_INSPECTION`
- `SECURITY_REPORT`
- `CCTV_REVIEW`
- `STAFF_OBSERVATION`
- `DOCUMENT_REVIEW`
- `MULTIPLE_INDEPENDENT_REPORTS`
- `OTHER`

### VER-002 — Policy-based requirement

Verification requirement must be policy-driven, not simply `privacyMode == ANONYMOUS`.

Examples:

- Community Rules + Anonymous → verification required;
- Security + Anonymous → verification required or recommended according to tenant policy;
- Maintenance + Anonymous → may not require verification before a work order;
- Named Community Rules complaint → tenant may still require verification.

### VER-003 — Punitive enforcement block

When policy requires verification, any action classified as punitive/enforcement must fail server-side until verification is satisfied.

Phase 1 must establish the gate even if the complete fine/notice engine is deferred.

### VER-004 — No allegation-to-penalty shortcut

No UI action or API path may treat a complaint allegation alone as sufficient authorization for a penalty when the configured verification gate is unsatisfied.

### VER-005 — Verification auditability

Creation, status change, findings update, verifier assignment, and verification completion must create tenant-scoped audit/timeline records.

### VER-006 — Verification separation from privacy disclosure

Successful verification does not automatically reveal a confidential complainant's identity. Confidential identity access remains governed by its separate authorization and audit workflow.

---

## 6.4 Grievance Case Foundation

### GRV-001 — Separate grievance-case entity

Introduce a minimal `GrievanceCase` domain record linked to a complaint when a formal grievance/compliance proceeding is initiated.

The complaint itself remains the intake record.

### GRV-002 — Formal-action promotion

Authorized users must be able to promote an eligible complaint into a grievance case without duplicating the complaint content.

**Acceptance criteria:**

- one complaint may have the allowed number of grievance proceedings according to final schema decision;
- promotion is explicit and audit logged;
- tenant boundaries are revalidated server-side;
- grievance creation does not disclose anonymous/confidential identity.

### GRV-003 — Minimal Phase 1 grievance state

Phase 1 should use a small grievance foundation state model rather than copying all future hearing/board states immediately.

Recommended initial values:

- `ASSESSMENT`
- `VERIFICATION_REQUIRED`
- `VERIFIED`
- `READY_FOR_FORMAL_PROCESS`
- `CLOSED_NO_ACTION`
- `CLOSED_UNSUBSTANTIATED`

Future Phase 2 migrations may add notice, mediation, hearing, decision, board review, appeal, and final states.

### GRV-004 — Complaint status remains operational

Creating/updating a grievance case must not silently replace the existing complaint operational status history. Where a cross-domain mapping is required, it must be explicit and tested.

### GRV-005 — Board-review preparation

`ComplaintCategory.requiresBoardReview` must be treated as future formal-process policy metadata. Phase 1 must not falsely mark a case as board-approved merely because the category flag is set.

---

## 6.5 Grievance Committee Membership and Permissions

### COM-001 — Tenant-scoped committee membership

Model Grievance Committee appointment as a tenant-scoped business membership rather than relying only on a global platform/user role enum.

Suggested positions:

- `CHAIR`
- `MEMBER`
- `SECRETARY`
- `MEDIATOR`

### COM-002 — Appointment lifecycle

Committee membership must support:

- start date;
- optional end date;
- active/inactive state;
- tenant scope;
- appointed user;
- position;
- audit metadata.

### COM-003 — Scoped permissions

The design must support specific grievance permissions rather than granting broad admin authority automatically.

Recommended permissions/capabilities:

- `VIEW_GRIEVANCE`
- `TRIAGE_GRIEVANCE`
- `VERIFY_GRIEVANCE`
- `CONDUCT_MEDIATION` (future)
- `CONDUCT_HEARING` (future)
- `RECORD_MINUTES` (future)
- `VOTE_GRIEVANCE` (future)
- `REVEAL_CONFIDENTIAL_IDENTITY`
- `APPROVE_ENFORCEMENT` (future)

### COM-004 — Effective-role compatibility

Complaint/grievance authorization must use HOAHub's effective multi-role access model and must not accidentally fall back to legacy primary-role-only checks where that would exclude a valid assigned role.

### COM-005 — Confidential identity default denial

`STAFF` and ordinary committee members must not gain confidential complainant identity access merely by being able to process a grievance.

Identity reveal remains a separately authorized, reasoned, explicitly confirmed, audited action.

### COM-006 — Grievance Chair authority is not blanket admin authority

A Grievance Chair appointment must not automatically grant unrelated finance, billing, tenant-management, or platform privileges.

---

## 6.6 Process Deadlines vs Operational SLA

### DDL-001 — Separate deadline entity

Introduce a `GrievanceDeadline`/process-deadline concept separate from `Complaint.dueAt` and complaint operational resolution SLA.

### DDL-002 — Deadline types

The model must be extensible to future deadline types such as:

- `RESPONDENT_RESPONSE`
- `MEDIATION_SCHEDULING`
- `HEARING_NOTICE`
- `RECONSIDERATION`
- `APPEAL`
- `CORRECTIVE_ACTION`

Phase 1 may implement only the core entity and a limited initial type set.

### DDL-003 — Pause operational SLA while process deadline runs

The architecture must support cases where HOA staff is waiting for a resident/process deadline without unfairly counting the entire wait period against operational handling metrics.

### DDL-004 — Deadline lifecycle

A process deadline must support at minimum:

- starts at;
- due at;
- completed at;
- paused at where applicable;
- pause reason;
- status;
- policy source/reference text where appropriate;
- audit history.

### DDL-005 — No universal hard-coded grace period

No universal legal response period may be hard-coded into application logic without a separately approved legal/policy requirement.

Tenant configuration/policy must determine the relevant duration.

### DDL-006 — Deadline time-zone consistency

All deadline calculations and UI rendering must follow HOAHub's established tenant/application timezone handling and must be covered by tests for boundary dates/times.

---

# 7. Data Model Requirements

The exact Prisma schema is an implementation decision, but Phase 1 must support these domain concepts:

```text
Complaint
 ├─ ComplaintMessage                 existing, extended
 ├─ ComplaintTrackingCredential      existing
 ├─ ComplaintConfidentialIdentity    existing
 ├─ ComplaintSubject                 new
 ├─ ComplaintVerification            new
 ├─ ComplaintAnonymousSession        new
 └─ GrievanceCase                    new/minimal
        └─ GrievanceDeadline          new

Tenant
 └─ GrievanceCommitteeMembership     new
```

### DATA-001 — Additive migration

Phase 1 database changes must be additive and migration-safe for existing tenants/data.

### DATA-002 — Mandatory tenant keys

Every new tenant-owned domain table must contain/enforce tenant scope consistent with HOAHub's Prisma tenant boundary architecture.

### DATA-003 — Anonymous-session unlinkability

`ComplaintAnonymousSession` must not include homeowner/user identity foreign keys.

### DATA-004 — Message author behavior

Anonymous complainant messages must permit null internal author identity while still preserving safe sender type/channel metadata.

### DATA-005 — Snapshot strategy

Property/subject snapshots may be stored where needed to preserve the historical record when current homeowner/property master data later changes.

### DATA-006 — Referential deletion behavior

Deletion/cascade/restrict behavior must be explicitly reviewed to prevent accidental removal of grievance history, evidence references, or audit-relevant records.

---

# 8. API / Service Requirements

Recommended Phase 1 anonymous endpoints:

```text
POST   /api/complaints/anonymous/session
GET    /api/complaints/anonymous/messages?after=<cursor>
POST   /api/complaints/anonymous/messages
DELETE /api/complaints/anonymous/session
```

### API-001 — Service-layer authority

Routes must delegate tenant/privacy/business rules to service-layer functions. Client-provided tenant IDs, roles, user IDs, complaint ownership, or authorization claims are never authoritative.

### API-002 — Minimal anonymous response DTO

Anonymous APIs return only the minimum public case/message information required by the tracker.

Do not expose:

- internal user IDs;
- admin/staff email;
- homeowner ID/account ID;
- confidential identity records;
- identity-access grants;
- internal notes;
- internal timeline metadata;
- tenant secrets/configuration;
- storage paths.

### API-003 — No-store response policy

Anonymous complaint session/message endpoints and confidential/grievance-sensitive reads must use appropriate private/no-store cache headers.

### API-004 — Origin/CSRF protection

State-changing anonymous session/message requests must use the application's approved origin/CSRF protection strategy.

### API-005 — Consistent error disclosure

Authentication and lookup failures must avoid revealing whether a code/complaint exists outside the caller's valid credential/session context.

---

# 9. Security and Privacy Requirements

### SEC-GRV-001 — Tenant isolation

All new queries/mutations must be tenant-scoped. Cross-tenant subject, committee, grievance, verification, session, deadline, or message access is a release blocker.

### SEC-GRV-002 — Effective RBAC

Authorization must use effective assigned roles/permissions where HOAHub supports multi-role access.

### SEC-GRV-003 — Confidential identity isolation

Existing `ComplaintConfidentialIdentity` separation must be preserved. Phase 1 must not copy confidential identity into grievance, verification, subject, deadline, message, analytics, or session records.

### SEC-GRV-004 — Anonymous identity isolation

No new anonymous messaging/session implementation may create a direct or indirect application-domain foreign-key link back to the submitting homeowner.

### SEC-GRV-005 — Secret handling

PINs, session tokens, signing secrets, hashes intended to remain server-only, and production credentials must never be returned/logged beyond their intended boundary.

### SEC-GRV-006 — Server enforcement

Verification gates, message visibility, subject access, committee authority, confidential reveal rights, and grievance promotion must be enforced server-side, not only through hidden/disabled UI controls.

### SEC-GRV-007 — Audit trail

Security/business-sensitive actions must be auditable, including:

- grievance promotion;
- verification requirement/status change;
- verification completion;
- committee appointment/termination;
- process-deadline changes;
- confidential identity reveal related to a grievance;
- anonymous session revocation events where useful without identifying the anonymous resident.

### SEC-GRV-008 — Plain-text anonymous messaging

Phase 1 anonymous messages are text-only. HTML/script execution and rich-content injection must not be supported.

### SEC-GRV-009 — Attachment exclusion

Anonymous follow-up attachments are explicitly disabled in Phase 1 because image/document metadata can unintentionally reveal identity and increases malware/privacy surface.

### SEC-GRV-010 — Abuse controls

Rate limits and bounded pagination/message retrieval must prevent unbounded brute force, spam, or data extraction.

---

# 10. UX / Mobile / PWA Requirements

### UX-GRV-001 — Anonymous conversation usability

After successful tracking authentication, the user should see a compact case header, conversation stream, and composer without needing a desktop layout.

### UX-GRV-002 — Preserve privacy language

The UI must not imply that an anonymous resident is identifiable to the handler when the case model does not contain that identity.

### UX-GRV-003 — Public vs internal clarity for staff

Admin messaging controls must clearly distinguish public complainant-facing messages from internal notes.

### UX-GRV-004 — Verification gate visibility

Authorized staff must be able to understand:

- whether verification is required;
- current verification status;
- what action is blocked;
- what must happen before the gate is satisfied.

### UX-GRV-005 — Structured subject entry

Complaint/admin forms must clearly distinguish subject property/person from incident location.

### UX-GRV-006 — Phone viewport safety

Anonymous tracker and any homeowner-facing subject interactions must:

- avoid horizontal scrolling;
- use shrink-safe layouts;
- preserve safe-area behavior;
- maintain practical ~48px primary touch targets;
- support on-screen keyboard without hiding the composer/send action;
- honor reduced-motion requirements if motion is introduced.

---

# 11. Reporting and Analytics Requirements

### RPT-001 — No identity leakage

Existing privacy-aware complaint reports must remain identity-free unless a separately authorized report explicitly permits otherwise.

### RPT-002 — Verification metrics readiness

The data model should support future counts for:

- verification required;
- pending verification;
- verified/substantiated;
- closed unsubstantiated;
- verification method.

### RPT-003 — Subject trend readiness

The data model should support future authorized aggregation by subject property/phase/block/lot without exposing complainant identity.

### RPT-004 — Grievance metrics readiness

The grievance foundation should support future case-aging and outcome metrics independently from ordinary complaint SLA metrics.

Phase 1 does not require the full reporting UI.

---

# 12. Audit and Timeline Requirements

Recommended new complaint/grievance timeline events:

- `ANONYMOUS_MESSAGE_ADDED`
- `SUBJECT_ADDED`
- `SUBJECT_UPDATED`
- `VERIFICATION_REQUIRED`
- `VERIFICATION_STARTED`
- `VERIFICATION_COMPLETED`
- `GRIEVANCE_CREATED`
- `DEADLINE_CREATED`
- `DEADLINE_UPDATED`
- `COMMITTEE_ASSIGNED` where case-specific assignment is later introduced.

Timeline records exposed to anonymous/homeowner users must continue to be filtered to safe/public information only.

---

# 13. Non-Functional Requirements

### NFR-GRV-001 — Backward compatibility

Existing complaint submission, admin queue, homeowner complaint list/detail, confidential identity controls, and reports must continue working for tenants that do not use the grievance extension.

### NFR-GRV-002 — Performance

Polling endpoints must be cursor-based, indexed appropriately, bounded, and must not repeatedly load full complaint objects/identity relations unnecessarily.

### NFR-GRV-003 — Reliability

Message writes and critical grievance/verification state changes must be transactional where multiple persistence records/timeline/audit records must remain consistent.

### NFR-GRV-004 — Accessibility

New controls require labels, keyboard support, visible focus, readable status text, and non-color-only state communication.

### NFR-GRV-005 — Observability without privacy leakage

Operational errors/metrics may identify endpoint/category/status but must not log raw PINs, raw anonymous session tokens, confidential identity, or resident-sensitive message content unless a separately approved secure logging policy requires it.

### NFR-GRV-006 — Testability

Business rules must be implemented in service/domain functions that can be tested without relying exclusively on browser tests.

### NFR-GRV-007 — Deployment safety

Database migration, application release, and rollback plan must preserve existing complaint data and must follow HOAHub's Hostinger/main-branch deployment contract documented in `Agent.md`.

---

# 14. Proposed Implementation Components

Exact filenames may change after implementation review. Expected areas include:

```text
prisma/schema.prisma
prisma/migrations/<phase1-grievance-migration>/
lib/services/complaints.ts
lib/services/grievances.ts                       new
lib/services/complaint-anonymous-session.ts      new
lib/services/complaint-verification.ts           new or grievance service
lib/services/grievance-committee.ts              new
app/complaints/track/page.tsx
app/admin/complaints/[id]/page.tsx
app/admin/complaints/settings/page.tsx
app/api/complaints/anonymous/session/route.ts    new
app/api/complaints/anonymous/messages/route.ts   new
tests/unit/...                                   new/updated
tests/integration/...                            new/updated
docs/complaints/...                              updated
Agent.md                                         updated every change
```

The implementation task must first inspect current source and choose the smallest coherent service split; this BRD does not require a specific file count.

---

# 15. Primary Workflow Requirements

## 15.1 Anonymous Conversation Workflow

```text
Anonymous complainant
      │
      │ Tracking Code + PIN
      ▼
Verify credential + rate limit
      │
      ▼
Create short-lived anonymous session
      │
      ├──────────────► Poll PUBLIC messages by cursor
      │
      └──────────────► Post text-only PUBLIC reply
                              │
                              ▼
                    ComplaintMessage + timeline/audit
```

## 15.2 Verification Workflow

```text
Complaint received
      │
      ▼
Evaluate tenant verification policy
      │
      ├── Not required ──────────────► continue normal processing
      │
      └── Required
             │
             ▼
       Verification pending
             │
       ┌─────┴─────┐
       │           │
    Failed/       Passed
  insufficient      │
       │            ▼
       │       enforcement gate satisfied
       ▼
close/no action or continue non-punitive handling
```

## 15.3 Complaint-to-Grievance Promotion

```text
Complaint
   │
   │ Authorized formal-action decision
   ▼
GrievanceCase
   │
   ├─ ComplaintSubject(s)
   ├─ Verification
   ├─ Committee authority
   └─ Process deadlines
```

---

# 16. UAT / Acceptance Scenarios

Minimum Phase 1 UAT must include:

### Anonymous Messaging

- UAT-GRV-001: valid anonymous tracking code + PIN creates an anonymous conversation session.
- UAT-GRV-002: invalid code/PIN returns generic failure and is rate-limited.
- UAT-GRV-003: raw PIN/session token is not stored in logs/domain records.
- UAT-GRV-004: anonymous user sees existing public messages only.
- UAT-GRV-005: anonymous user posts text reply and admin sees it.
- UAT-GRV-006: admin posts public question and anonymous user receives it through polling.
- UAT-GRV-007: admin internal note never appears to anonymous user.
- UAT-GRV-008: duplicate retry with same client message ID creates one message.
- UAT-GRV-009: expired/revoked anonymous session cannot read/post messages.
- UAT-GRV-010: anonymous message/session records contain no user/homeowner identity link.
- UAT-GRV-011: tracker is usable on supported mobile/PWA viewport and retains Back to Home.

### Subject / Property

- UAT-GRV-012: complaint can link to structured same-tenant property subject.
- UAT-GRV-013: incident location remains independent from subject property.
- UAT-GRV-014: cross-tenant property/subject identifier is rejected.
- UAT-GRV-015: multiple subjects can be represented when enabled by the chosen UI/schema.

### Verification

- UAT-GRV-016: tenant/category policy can require independent verification.
- UAT-GRV-017: required verification blocks configured punitive/enforcement action while pending.
- UAT-GRV-018: verification completion is audit logged.
- UAT-GRV-019: verification does not reveal confidential complainant identity.
- UAT-GRV-020: named complaint may also require verification according to policy.

### Committee / Roles

- UAT-GRV-021: active committee membership is tenant-scoped.
- UAT-GRV-022: committee member cannot access another tenant's grievance.
- UAT-GRV-023: committee appointment does not grant unrelated broad admin privileges.
- UAT-GRV-024: confidential reveal remains denied unless user also satisfies specific reveal authority.
- UAT-GRV-025: effective multi-role authorization works for valid assigned grievance authority.

### Deadlines / SLA

- UAT-GRV-026: process deadline is stored separately from complaint resolution SLA.
- UAT-GRV-027: operational SLA can be paused/adjusted according to approved policy while waiting on process deadline.
- UAT-GRV-028: deadline duration is tenant/policy configurable rather than a universal hard-coded 5/7-day value.
- UAT-GRV-029: timezone boundary rendering/calculation is correct.

### Regression / Security

- UAT-GRV-030: existing named/confidential/anonymous intake continues working.
- UAT-GRV-031: existing homeowner complaint history remains privacy-correct.
- UAT-GRV-032: existing confidential identity reveal remains reasoned, confirmed, audited, and no-store.
- UAT-GRV-033: complaint reports do not leak complainant identity.
- UAT-GRV-034: all new records and APIs fail cross-tenant tests.
- UAT-GRV-035: current CI validation gates pass before merge/deployment.

---

# 17. Definition of Done — Phase 1

Phase 1 is complete only when all of the following are true:

1. all accepted Phase 1 requirements are implemented;
2. Prisma migration is additive and validated;
3. anonymous messaging passes privacy and session-isolation tests;
4. anonymous tracker supports two-way text messaging on phone/PWA;
5. complaint subject/property linkage is tenant-safe;
6. verification gate prevents configured punitive action while unsatisfied;
7. grievance committee membership/permissions are tenant-scoped and effective-role compatible;
8. process deadlines are separate from operational SLA;
9. existing complaint UAT/regression behavior remains intact;
10. `Agent.md` is updated with final files, migrations, tests, status, rollback, and deployment information;
11. CI passes the repository validation gate;
12. implementation is merged to `main` through approved GitHub flow;
13. Hostinger deployment is confirmed only when production `/release.txt` matches the expected `main` commit and `/api/health` succeeds;
14. post-deployment smoke/UAT verifies anonymous messaging and grievance foundation in production without tenant/privacy regression.

---

# 18. Rollback Requirements

Because Phase 1 is expected to add database tables/columns, rollback must prefer application compatibility over destructive schema reversal.

- Application rollback should be able to ignore new additive tables safely.
- Do not drop grievance/verification/session/subject history merely to roll back UI/service code.
- Feature/configuration switches should permit disabling new grievance/anonymous messaging behavior if needed while preserving complaint intake.
- Any migration that changes an existing complaint column must include an explicit backward-compatibility review before implementation.
- Production rollback follows the Hostinger managed GitHub deployment process and must verify release marker + health after rollback.

---

# 19. Risks and Controls

| Risk | Control |
| --- | --- |
| Anonymous messaging accidentally deanonymizes resident | No user/homeowner FK in anonymous session/message, minimal DTO, privacy tests |
| PIN replay/brute force | Existing bcrypt credential model, auth rate limit, short-lived session |
| Polling overload | Cursor pagination, adaptive interval, pause on hidden tab, indexes |
| Internal notes leaked publicly | Server visibility filtering, dedicated regression tests |
| False allegation directly triggers penalty | Policy-based verification gate enforced server-side |
| Committee appointment grants excessive authority | Tenant-scoped business membership + permission checks |
| Cross-tenant property/grievance access | Tenant predicates + negative integration tests |
| Hard-coded legal timeline becomes incorrect | Tenant/policy-configurable process deadlines |
| Existing Complaint Management regresses | Additive schema + regression/UAT gate |
| Deployment reported live prematurely | `/release.txt` expected SHA + `/api/health` verification |

---

# 20. Status and Change Tracking

This BRD is the baseline source for Phase 1 requirement IDs.

| Stage | Status | Evidence / Notes |
| --- | --- | --- |
| Business recommendation accepted | COMPLETE | User approval on 2026-08-17 |
| BRD v1.0 | COMPLETE | This document |
| Agent.md planning entry | REQUIRED IN SAME DOCUMENTATION BRANCH | Must reference this BRD and status tracker |
| Technical design | NOT STARTED | Awaiting next instruction |
| Schema design | NOT STARTED | Awaiting implementation task |
| Implementation | NOT STARTED | No production code changed by this BRD |
| Automated tests | NOT STARTED | Defined by requirements/UAT above |
| PR / review | NOT STARTED | Documentation branch only at BRD creation |
| Merge to main | NOT STARTED | Must follow approved GitHub flow |
| Hostinger deployment | NOT DEPLOYED | Feature must not be reported live before release marker + health verification |
| Production UAT | NOT STARTED | Required after verified deployment |

---

# 21. Next Task Boundary

Creation of this BRD does **not** authorize implementation or production deployment by itself.

The next task should begin only after an explicit instruction to proceed. Recommended next action is a **technical implementation plan / schema + API design for Phase 1**, followed by implementation in controlled PR-sized increments.
