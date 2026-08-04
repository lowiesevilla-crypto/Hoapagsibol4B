# HOAHub Commercial MVP and Pilot Release Standard

**Status:** Proposed for product-owner approval  
**Document owner:** Lowie M. Sevilla  
**Effective date:** August 5, 2026  
**Related issue:** #24  
**Target:** First commercially viable HOA pilot release

## 1. Purpose

This document defines the minimum commercially viable HOAHub release for a pilot homeowners association. It establishes the product boundary, end-to-end workflows, measurable release gates, pilot success metrics, and user-acceptance plan.

The release decision must be based on objective evidence. Estimated module-completion percentages alone are not sufficient for release approval.

## 2. Pilot objective

Enable one homeowners association to operate its core homeowner, billing, payment, communication, and document-request processes in HOAHub without direct database manipulation or routine developer intervention.

The pilot must demonstrate that HOAHub is:

- operationally useful for an HOA administrator and treasurer;
- safe for real tenant and homeowner data;
- accurate for approved finance scenarios;
- usable on supported desktop and mobile experiences;
- supportable through documented deployment, backup, restore, and incident procedures.

## 3. Primary pilot users

### HOA administrator or property manager

Maintains homeowner and property records, configures authorized operational settings, publishes announcements, manages requests, and supports day-to-day HOA operations.

### Treasurer or accounting staff

Configures approved billing rules, previews and generates billing, records and allocates payments, issues receipts, and reviews statements and collection results.

### Homeowner or resident

Views authorized balances, statements, payment records, receipts, announcements, and documents; submits and tracks supported document requests through the homeowner experience.

## 4. MVP scope

### In scope

- Authentication, session security, and tenant resolution
- Tenant-scoped user access and role-based authorization
- Homeowner and property registration and maintenance
- Approved homeowner/property import for pilot onboarding
- Billing rules, billing preview, and billing generation
- Duplicate-billing prevention and idempotent generation
- Payments, payment allocation, void/refund controls where enabled
- Official receipts and statement of account
- Announcements
- Core document requests, review, approval, generation, and tracking
- Homeowner mobile/PWA access to pilot-critical information
- Audit logs for sensitive actions
- Health checks, operational backup, and restore verification
- Pilot UAT, release evidence, and support documentation

### Explicitly deferred from the pilot release

- Advanced HRIS and full employee self-service
- Predictive analytics and automated decision-making
- General-purpose AI assistant
- Autonomous financial, legal, or collection actions
- Expansion to schools, churches, NGOs, business parks, or unrelated markets
- Nonessential community features that do not block the pilot workflows
- Custom integrations not required by the selected pilot HOA

Deferred work may remain visible in the roadmap or backlog but cannot enter the pilot release without a documented scope change and product-owner approval.

## 5. End-to-end MVP workflows

### Workflow 1 — Register homeowner and assign property

- **Primary user:** HOA administrator
- **Trigger:** A new homeowner, resident, or property record must be established.
- **Expected result:** The authorized user creates or updates the homeowner and property relationship within the correct tenant, with required identifiers and status fields.
- **Failure handling:** Duplicate, incomplete, invalid, or cross-tenant records are rejected with understandable messages. No partially trusted relationship is created.
- **Audit requirement:** Create, update, reassignment, move-in, move-out, and material status changes record actor, tenant, timestamp, and relevant before/after values.
- **Mobile requirement:** Essential lookup and review are mobile accessible; complex bulk administration may remain desktop/tablet optimized.

### Workflow 2 — Import homeowners and properties

- **Primary user:** Authorized tenant administrator
- **Trigger:** Initial pilot data or an approved batch update must be loaded.
- **Expected result:** A versioned template is validated before import; successful, skipped, and failed rows are reported clearly.
- **Failure handling:** Invalid rows, duplicate relationships, malformed identifiers, and cross-tenant references do not create trusted records. The user receives row-level remediation details.
- **Audit requirement:** Import actor, tenant, file metadata, template version, counts, outcome, and any approved opening-balance operation are recorded without logging sensitive data in plaintext.
- **Mobile requirement:** Import execution is desktop/tablet optimized; import status and summary must be readable on mobile.

### Workflow 3 — Configure billing rules

- **Primary user:** Treasurer or authorized billing administrator
- **Trigger:** The HOA approves dues, assessments, discounts, penalties, exemptions, due dates, or effective periods.
- **Expected result:** A tenant-scoped rule is created with clear scope, effective dates, calculation basis, and approval status.
- **Failure handling:** Conflicting, incomplete, unauthorized, retroactively unsafe, or ambiguous rules are blocked or explicitly warned before activation.
- **Audit requirement:** Rule creation, activation, amendment, deactivation, and approval record actor, tenant, old state, new state, timestamp, and reason when required.
- **Mobile requirement:** Rule review and approval must be usable on supported mobile layouts; complex configuration may be desktop/tablet optimized.

### Workflow 4 — Preview and generate billing

- **Primary user:** Treasurer or authorized billing generator
- **Trigger:** A billing period is ready for computation.
- **Expected result:** The user previews affected accounts, amounts, exemptions, penalties, warnings, and totals before a separate confirmed generation action.
- **Failure handling:** Duplicate or repeated requests are idempotent. Conflicting rules, missing account relationships, or invalid amounts prevent unsafe generation and produce actionable diagnostics.
- **Audit requirement:** Preview and generation record tenant, period, rule versions, initiator, approver where applicable, result counts, totals, warnings, and generation identifier.
- **Mobile requirement:** Billing summary and approval are mobile readable; large account-level reconciliation may be desktop/tablet optimized.

### Workflow 5 — Record and allocate payment

- **Primary user:** Treasurer or authorized payment processor
- **Trigger:** A valid payment is received or an approved payment submission is processed.
- **Expected result:** The payment is recorded once, allocated according to approved rules, and reflected consistently in ledger and balance views.
- **Failure handling:** Duplicate reference numbers, invalid amounts, over-allocation, unauthorized accounts, and cross-tenant identifiers are rejected. Retry behavior does not duplicate the transaction.
- **Audit requirement:** Payment creation, allocation, correction, void, and refund record actor, tenant, amount, references, before/after balances, reason, and linked audit events.
- **Mobile requirement:** Homeowners can review their payment status on mobile; staff payment processing must remain usable on supported tablet/mobile layouts where operationally required.

### Workflow 6 — Issue receipt and statement of account

- **Primary user:** Treasurer/accounting staff and homeowner
- **Trigger:** A payment is finalized or a current account statement is requested.
- **Expected result:** Receipt and SOA totals reconcile with the authoritative ledger and show the correct tenant, homeowner, property, period, and transaction information.
- **Failure handling:** Generation fails safely if data is inconsistent, unauthorized, or incomplete. A failed document does not mark the transaction as successfully issued.
- **Audit requirement:** Issuance, reissuance, cancellation/void, and access to sensitive generated documents are traceable.
- **Mobile requirement:** Homeowners can view or download authorized receipts and SOAs through the mobile experience.

### Workflow 7 — Publish announcement

- **Primary user:** Authorized HOA administrator or communications role
- **Trigger:** The HOA needs to communicate an approved notice.
- **Expected result:** The announcement is created, optionally scheduled, and visible only to the intended tenant and audience.
- **Failure handling:** Unauthorized publication, invalid scheduling, unsafe attachments, and cross-tenant audience selection are rejected.
- **Audit requirement:** Draft, publication, edit, unpublish, and attachment changes record actor, tenant, time, and material changes.
- **Mobile requirement:** Homeowners can read announcements and supported attachments on mobile.

### Workflow 8 — Submit and process document request

- **Primary user:** Homeowner, HOA administrator, secretary, or authorized approver
- **Trigger:** A homeowner requests a supported certificate or document.
- **Expected result:** The request is tenant-scoped, validated, tracked through defined statuses, reviewed by an authorized user, and generates the approved document.
- **Failure handling:** Missing prerequisites, unauthorized approvals, invalid template data, duplicate submissions, and generation failures preserve a recoverable request state with clear next steps.
- **Audit requirement:** Submission, status changes, approval/rejection, generation, issuance, and verification events are recorded.
- **Mobile requirement:** Homeowners can submit, view status, and access issued documents on mobile.

### Workflow 9 — Homeowner mobile self-service

- **Primary user:** Homeowner or resident
- **Trigger:** An authenticated homeowner needs current account or community information.
- **Expected result:** The user sees only authorized properties and records, including balances, payments, receipts, SOA, announcements, document requests, and issued documents included in the pilot.
- **Failure handling:** Expired sessions, unauthorized property access, unavailable data, and offline/error states provide safe recovery without exposing another user or tenant's information.
- **Audit requirement:** Sensitive downloads or document access are logged where required by policy.
- **Mobile requirement:** Critical flows are designed and verified for supported mobile viewport sizes and PWA usage.

## 6. Mandatory release gates

All mandatory gates must pass. A failed gate requires remediation or an explicit product-owner decision to stop the release; critical security, tenant-isolation, finance-integrity, and restore failures cannot be waived for pilot production.

### Functional gate

- All nine workflows pass approved happy-path, boundary, invalid-input, and recovery scenarios.
- No unresolved critical or high-severity defects remain.
- No workflow depends on direct production database modification for routine operation.
- Generated finance and document outputs reconcile with authoritative data.

### Finance-integrity gate

- Billing accuracy is 100% for the approved scenario catalog.
- Duplicate billing count is zero.
- Repeated generation and payment submissions are idempotent.
- Payment, allocation, receipt, ledger, and SOA totals reconcile.
- Void/refund scenarios preserve traceability and recalculate balances correctly.

### Security and authorization gate

- Privileged server actions, APIs, and data loaders enforce server-side authorization.
- Denied operations are tested for representative roles.
- Sensitive changes produce complete audit records.
- Secrets, credentials, production uploads, logs, and backups are not committed to source control.
- Authentication, session expiry, revocation, and password/invitation handling meet the approved security design.

### Tenant-isolation and privacy gate

- Cross-tenant read, write, export, attachment, document, and identifier-inference tests pass.
- Homeowners can access only authorized accounts and properties.
- Pilot privacy notice, access model, retention rules, and operational responsibilities are approved.
- Sensitive fields are not exposed through logs, errors, exports, or client payloads beyond authorized need.

### Performance and reliability gate

- Critical user actions meet agreed pilot response-time baselines under representative load.
- Billing generation and imports complete within the approved operational window for the pilot data set.
- Application health, database availability, storage, and critical failures are observable.
- No known memory, connection, or storage issue threatens normal pilot operation.

### Backup, restore, and operational-readiness gate

- A fresh production-equivalent backup is created successfully.
- A restore rehearsal is completed in an isolated environment and model counts/integrity are verified.
- Recovery point and recovery time objectives are recorded for the pilot.
- Deployment, rollback/recovery, incident response, and tenant support contacts are documented.
- Uploaded files and generated documents are included in the applicable backup/recovery design.

### Accessibility and mobile gate

- Critical controls have labels, keyboard access, visible focus, understandable errors, and acceptable contrast.
- Critical mobile flows are verified on approved viewport sizes and supported browsers.
- Forms, dialogs, tables/cards, navigation, generated documents, and downloads remain usable on mobile where required.

### UAT and product-approval gate

- The selected pilot HOA or authorized representative executes the approved UAT plan.
- Every scenario records tester, environment, data set, result, evidence, defect link, and retest result.
- Product owner reviews release evidence and records an explicit approve/reject decision.

## 7. Pilot success metrics

### Release-entry targets

| Metric | Required target |
|---|---:|
| Billing accuracy for approved scenarios | 100% |
| Duplicate billings | 0 |
| Cross-tenant data exposure | 0 |
| Unresolved critical/high defects | 0 |
| Successful backup and restore rehearsal | Required |
| Nine MVP workflow UAT completion | 100% |
| Critical mobile workflow completion | 100% |
| Failed privileged-action authorization tests | 0 |

### Pilot operating baselines

The following must be measured during the pilot and reviewed weekly:

- active users by role;
- successful and failed logins;
- billing runs, warnings, failures, totals, and duration;
- payments recorded and reconciliation exceptions;
- receipt/SOA/document generation success rate;
- open requests and average processing time;
- homeowner mobile usage and critical-flow completion;
- production errors, availability, and mean time to recovery;
- support requests by category and severity;
- user satisfaction feedback from administrator, treasurer, and homeowner participants.

Baseline values will be established during the first two pilot weeks. Target adjustments require product-owner approval and must not relax security, tenant-isolation, finance-integrity, or restore requirements.

## 8. Pilot UAT plan

Each workflow requires at least one approved happy-path scenario and the specified risk scenarios. All UAT evidence must reference a test account and tenant created for the pilot or an approved sanitized production-equivalent data set.

| ID | Workflow | Minimum UAT scenarios |
|---|---|---|
| UAT-MVP-01 | Homeowner/property registration | New homeowner; existing homeowner with additional property; duplicate record; invalid relationship; unauthorized role |
| UAT-MVP-02 | Data import | Clean import; mixed valid/invalid rows; duplicate import; cross-tenant identifier; downloadable error report |
| UAT-MVP-03 | Billing-rule configuration | Monthly dues; discount/exemption; penalty; conflicting date/scope; unauthorized edit |
| UAT-MVP-04 | Billing preview/generation | Normal cycle; exemption; warning resolution; repeated submission; duplicate-prevention verification |
| UAT-MVP-05 | Payment/allocation | Full payment; partial payment; duplicate reference; invalid allocation; void/refund and balance recalculation |
| UAT-MVP-06 | Receipt and SOA | Issue receipt; reissue; current SOA; mobile access; totals reconcile with ledger |
| UAT-MVP-07 | Announcement | Draft and publish; scheduled publication; audience visibility; unauthorized publication; mobile rendering |
| UAT-MVP-08 | Document request | Submit; review; approve/reject; generation failure recovery; issued-document mobile access |
| UAT-MVP-09 | Homeowner mobile | Login; multiple authorized properties; balances/payments; documents; announcement; expired session; attempted unauthorized access |

### UAT evidence template

For every executed scenario, record:

- UAT ID and scenario name
- Build/commit and environment
- Tenant and test user role
- Preconditions and test data
- Execution steps
- Expected result
- Actual result
- PASS/FAIL/BLOCKED
- Screenshot, generated artifact, log reference, or other evidence
- Defect/issue link if applicable
- Retest date and result
- Tester and approver

## 9. Traceability to implementation work

- **#25:** Automated finance, authorization, and tenant-isolation test suites
- **#26:** Multiple roles and granular permission matrix
- **#27:** Backlog consolidation into GitHub Issues and Projects
- **#28:** Tenant onboarding, homeowner import, and billing setup wizard

Additional defects or capability gaps discovered during release assessment must be created as GitHub Issues and linked to #24 or the relevant implementation issue.

## 10. Scope-change control

A proposed change to the pilot scope must document:

- user/business problem;
- reason it cannot wait until after the pilot;
- impact on security, tenant isolation, finance integrity, operations, schedule, and UAT;
- required implementation and test work;
- product-owner decision.

Unapproved scope changes must not be included in the pilot release.

## 11. Release decision record

Before pilot production activation, complete the following:

- [ ] MVP scope approved by product owner
- [ ] All mandatory release gates passed
- [ ] All UAT-MVP scenarios passed or formally resolved
- [ ] No unresolved critical/high defects
- [ ] Backup and restore rehearsal passed
- [ ] Security and tenant-isolation evidence reviewed
- [ ] Finance reconciliation evidence reviewed
- [ ] Pilot users, support contacts, and operational ownership confirmed
- [ ] Production activation date approved

**Product-owner decision:** Pending  
**Decision date:** Pending  
**Approved release/build:** Pending  
**Conditions or exceptions:** None approved

## 12. Definition of done for issue #24

- [x] MVP scope identifies included and deferred capabilities.
- [x] Nine workflows identify user, trigger, expected result, failure handling, audit, and mobile requirements.
- [x] Functional, finance, security, tenant-isolation, performance, backup/restore, accessibility, mobile, and UAT gates are defined.
- [x] Pilot metrics and baseline measurement requirements are defined.
- [x] Related implementation issues are linked.
- [x] Pilot UAT scenarios and evidence requirements are defined.
- [ ] Product owner approves this document through pull-request review.
- [ ] Issue #24 is closed after the approved document is merged.
