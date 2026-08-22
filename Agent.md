# HOAHub Agent Context

Last updated: 2026-08-22

## Purpose

Repository-level operating context for AI coding agents and maintainers working on HOAHub. Production safety, tenant isolation, authentication integrity, mobile/PWA usability, auditable deployment, and repository-context maintenance are release gates.

## Mandatory Agent.md Maintenance

`Agent.md` must be reviewed and updated for every repository change before merge or deployment.

For every branch/PR/change:
1. Read `Agent.md` before implementation.
2. Update relevant architecture, files, tests, rollback, and deployment state.
3. Keep `Last updated` current.
4. Never place credentials, tokens, production passwords, private keys, certificates, or secret values here.
5. Do not merge or deploy while this file is stale.

## Product and Architecture Baseline

- HOAHub is a multi-tenant community/homeowners-association SaaS platform.
- Primary stack: Next.js, React, TypeScript, Tailwind CSS, Prisma, MySQL.
- Production hosting: Hostinger managed Node.js application connected to GitHub `main`.
- Tenant-owned data must remain tenant-scoped at every UI, API, service, job, storage, cache, export, report, and AI boundary.
- Authenticated server-side session context is authoritative. Browser-supplied tenant IDs, roles, account owners, route parameters, or redirect destinations are never proof of authority.

## Non-Negotiable Security Rules

1. Preserve tenant isolation and fail closed when tenant/user authority is ambiguous.
2. Preserve RBAC/granular permissions and record-ownership checks on server-side actions.
3. Do not weaken session validation, passkey verification, login-choice authorization, `safeReturnTo`, CSRF/same-origin protections, or authentication redirect controls.
4. Never commit production secrets or expose them in logs, client payloads, or model payloads.
5. Do not expose raw database credentials/query execution to browser or AI/model surfaces.
6. State-changing operations require server-side business validation and appropriate audit/history evidence.
7. Security-sensitive behavior must remain covered by automated regression tests.
8. CI passing is not equivalent to production deployment.

## Homeowner Mobile and PWA Requirements

Homeowner-facing changes are phone/PWA-first.

- Use `100dvh` when full-height layout is needed.
- Respect safe-area insets.
- Keep primary touch targets approximately 48px where practical.
- Avoid hover-only interaction and horizontal overflow.
- Use shrink-safe `min-w-0`/`max-w-full` patterns where content can compress.
- Honor `prefers-reduced-motion` for non-essential animation.
- Keep critical forms/cards scrollable on short phone viewports without hiding primary actions behind keyboard/bottom navigation.
- Preserve passkey support.
- The root application layout owns the single `PwaInstallProvider`; do not add another provider in `app/portal/layout.tsx`.
- Private portal HTML, payments, receipts, documents, uploads, Server Actions, RSC, and router-prefetch traffic remain network-only/no-store under the reviewed PWA/cache policy.
- Public install prompting uses browser-supported installability events; do not claim universal installed-PWA detection.

## Authentication and Account Selection

### Community Pulse Login Boundary

Community Pulse is presentation only. It must not replace or bypass the existing server authentication action, tenant/account selection, session validation, passkey verification, or safe redirect logic.

- Pending credential authentication displays `Verifying access…`.
- `Access verified` is shown only after the server returns a valid authenticated redirect target.
- Non-essential login/post-login animation honors reduced motion.
- `lib/tenant-logo.ts` is server-only; client code must not import Node-only tenant-logo storage logic.

### Multi-Account Login Selection

A credential identity matching multiple active HOA/tenant accounts authenticates once and then chooses an authorized account.

- The server creates a short-lived signed `hoa_login_choice` HttpOnly cookie containing only allowed user IDs and purpose metadata.
- The second step sends `selectedUserId` only; credentials are not retained in React state, hidden fields, browser storage, or the choice cookie.
- A selected account must be present in the signed choice and revalidated active with its tenant before session creation.
- Missing/tampered/expired choice state fails closed.
- Session/audit/last-login persistence occurs through server authority before issuing the browser session cookie.
- Tenant isolation remains mandatory after account selection.

### Post-Login Brand Handoff

`hoahub.login.handoff.v1` is a short-lived browser presentation marker written only after successful credential/passkey authentication. It contains a local timestamp only and never identity, tenant, session, or credential data. Browser-storage failure must not affect authentication or navigation.

## Authentication Navigation Recovery — PR #127 / PR #130 Follow-up

PR #127 hardened logout, Browser Back/Forward restoration, and global error recovery across Tenant Admin, Platform Admin, Homeowner/PWA, and Employee protected surfaces. Premium Admin V2 PR #130 contains the final exact-browser transport correction.

### Final Auth Navigation Architecture

- Protected React pages do not directly mutate logout state. `components/auth-navigation-buttons.tsx` exposes an ordinary same-origin anchor to `/api/auth/logout-transition?scope=...`; scope is limited to `current` or `all`.
- The protected-page control does not use React form submission, direct client `fetch`, `useActionState`, `requestSubmit()`, client redirect authority, or a Server Action for session revocation.
- `GET /api/auth/logout-transition` is a non-mutating, private/no-store raw HTML transition document outside the protected React tree. It accepts only trusted same-origin/configured top-level navigation evidence.
- The transition document is self-contained and protected by a per-response CSP nonce, `connect-src 'self'`, `form-action 'none'`, `frame-ancestors 'none'`, private/no-store response headers, and a same-origin referrer policy.
- Its nonce-scoped script performs a fresh same-origin `PUT /api/auth/logout?scope=current|all` request with `credentials: "same-origin"`, `cache: "no-store"`, `redirect: "error"`, no request body, and the explicit `X-HOAHub-Logout-Transition: 1` marker. This avoids both stale Next Server Action POST dispatch and the prior DELETE-body/303 fetch-follow transport failure.
- `app/api/auth/logout/route.ts` remains the sole logout authority. Isolated PUT requires the transition marker, applies the same origin/configured-source validation, bounds scope to `current|all`, revokes session state, and returns `204` with only a bounded server-resolved relative login destination header.
- The transition validates that server-returned destination is same-origin and a login path before using `window.location.replace()` solely for final document navigation. The browser cannot invent a tenant, session, or arbitrary post-logout destination.
- Direct same-origin POST compatibility remains and finishes with an authoritative HTTP 303 login redirect after the same server-side revocation. GET-based session mutation remains prohibited.
- Protected-route recovery listens to `pageshow`/`popstate` restoration for `/admin`, `/platform`, `/portal`, and `/employee`; restored protected documents are reloaded so current server session/RBAC authority is re-established.
- `app/error.tsx` uses hard-document recovery for non-chunk failures and a guarded safe-entry fallback instead of repeatedly resetting the same broken React tree.
- Login/auth/private responses remain no-store. Same-origin/CSRF protections remain mandatory.

### Permanent Regression Contract

- `tests/e2e/auth-navigation-recovery.mjs` signs in as Tenant Admin, Platform Admin, and Homeowner, exercises authenticated history navigation, clicks the real visible logout control, requires server revocation and final login navigation, then verifies Browser Back cannot revive interactive protected content.
- The E2E selector may use `data-hoahub-logout-button` but must not bypass the UI with direct API mutation calls.
- Diagnostics may log only safe method/path/status and non-sensitive transition state; never cookies, credentials, auth headers, tenant data, or session material.
- `verify:auth-navigation-cache`, `verify:homeowner-mobile-hardening`, and `verify:homeowner-pwa` must validate the actual isolated transition/PUT transport, explicit transition marker, no-body mutation, same-origin proof, bounded destination handoff, private/no-store/CSP boundary, direct POST 303 compatibility, and server-side session revocation.
- A verifier may be updated when runtime transport changes only if the revised assertion continues to protect the intended security invariant. Do not make brittle source checks pass by adding dead strings/comments or weakening runtime behavior.
- No Prisma schema/migration, finance authority, payroll confidentiality, complaint/grievance privacy, document/template authority, AI governance, tenant isolation, or RBAC scope is changed by this auth correction.

## Active Initiative: Premium Admin UI V2 — PR #130

Approved Canva design: `DAHSu6LXZUk` — HOAHub Premium Admin UI V2 — 42 Route Redesign.
Tracking issue: #128.
Implementation branch: `feature/premium-admin-ui-v2`.
Implementation/traceability record: `docs/ui/HOAHUB_PREMIUM_ADMIN_UI_V2_IMPLEMENTATION.md`.

### Premium Admin V2 Architecture

- The Admin UI preserves the authenticated server layout as tenant/RBAC/module/entitlement authority.
- `components/page-header.tsx` is the canonical workspace PageHeader and supports legacy `action` plus premium `actions`/`context`; `components/ui/page-header.tsx` re-exports it.
- `app/admin/layout.tsx` applies `premium-admin-workspace` at the common content boundary. `app/canva-parity.css` owns shared premium card, table, field, filter, pagination, and responsive surface treatment.
- The Admin command catalog is built server-side from authorized route definitions, then filtered by role, enabled tenant modules, Document Management entitlement, AI use/manage permission, and payroll access before serialization to `ShellCommandSearch`.
- `ShellCommandSearch` supports authorized route/section/path terms, deduplication, `Ctrl/Cmd + K`, Arrow Up/Down, Enter, Escape, and combobox/listbox semantics. Never serialize inaccessible routes merely for discoverability.
- Homeowner directory search remains under authenticated `user.tenantId`. `lib/homeowner-admin-search.ts` parses explicit Block/Lot phrases such as `block 1 lot 2` into property constraints while retaining residual name/email/account terms.
- Canva sample/mock data is never production data. Existing Prisma records, server actions, finance ledgers, document state, complaint/grievance controls, payroll confidentiality, and AI governance remain authoritative.
- Production Gate Pass / Move In-Out templates and official document output are not recreated or replaced by this UI initiative.
- No Prisma schema migration is introduced by Premium Admin V2.

### Premium Admin V2 Scope and Responsive Contract

- The tracked inventory spans Settings/Account, Dashboard/Onboarding/Residents, Finance/Payments/Reports/Data, Document Operations/Repository, Complaints, AI, Chat, Attendance, and Payroll.
- Scoped routes inherit the shared premium workspace boundary and canonical PageHeader while retaining route-specific data/actions.
- Tables remain contained within operational scroll surfaces rather than causing page-level horizontal overflow.
- Essential Admin actions remain reachable at desktop/tablet/mobile widths.
- Visual-parity evidence covers representative desktop workspaces across Settings, Onboarding, Homeowners, Action Center, Billing, Payment Requests, Reports, Data, Documents, Document Repository, Complaints, Chat, and Workforce; tablet/mobile captures cover high-value responsive routes.

### Premium Admin V2 Search Release Gate

- Search is a release blocker, not decorative UI.
- `tests/unit/homeowner-admin-search.test.ts` covers structured Block/Lot parsing and generated Prisma conditions.
- `tests/e2e/admin-premium-search.mjs` logs in with the seeded Admin, uses keyboard command search to navigate to Homeowners, performs a real combined Block/Lot lookup against seeded tenant data, and verifies the empty-result state.
- The browser search regression remains part of `test:e2e`; do not remove or bypass it to obtain green CI.
- Existing route-level search controls remain server/tenant scoped and preserve reset/pagination semantics.

### Document Request Success Handoff

- `submitDocumentRequestAction` remains the authoritative request/workflow/audit/revalidation operation.
- `lib/actions/document-request-submission.ts` wraps the action only to redirect successful submissions back to `/portal/documents` with presentation-only success/message query parameters.
- `components/document-request-form.tsx` renders the server-controlled redirected success as an accessible `role="status"` message.
- Error state remains in `useActionState`; the form does not optimistically claim success or use a delayed client `router.refresh()` race.
- `tests/unit/document-request-submission-feedback.test.ts` and `tests/e2e/document-workflow.mjs` protect the handoff and browser-visible success/history behavior.

### Premium Admin V2 Release Contract

- PR #130 must remain draft until the exact final branch head passes both HOAHub MySQL CI and HOAHub Canva Visual Parity.
- A passing older head is never sufficient after a code, test, or documentation commit changes the branch SHA.
- The immediately preceding deterministic browser blocker was the isolated DELETE/303 fetch-follow logout transport. The final release candidate replaces that chain with the no-body same-origin PUT/204 bounded-destination handoff while preserving same-origin validation, server session revocation, private/no-store handling, and direct POST 303 compatibility. This is a runtime root-cause correction, not a bypass of the security gate.
- After exact-head green, the user has authorized marking PR #130 ready, merging the verified head to `main`, and proceeding through the existing Hostinger managed deployment without another approval prompt.
- Production completion requires the merged `main` verification/deploy workflow to pass, Hostinger to publish the expected short merge SHA at `/release.txt`, and `/api/health` to succeed.
- Applicable authenticated production UI/search smoke should be performed when an authorized production session is available. Do not fabricate live authenticated sign-off if production credentials/session access are unavailable.
- Rollback is application-level; revert the PR #130 merge if necessary while preserving business data.

## Tenant Onboarding Bulk Homeowner Import

- `/admin/onboarding` supports client-scale homeowner CSV dry-run validation and apply while preserving tenant-scoped permissions, exact-file hash revalidation, duplicate/property/account-number validation, privacy acknowledgement, audit evidence, opening-balance authority, and all-or-nothing transactional database apply.
- The parser's operational ceiling is `ONBOARDING_HOMEOWNER_MAX_ROWS = 5000`; this intentionally supports HOA communities above 2,050 homeowners while retaining a bounded single-upload limit. The existing 2 MB byte-size guard remains independent of the row ceiling.
- Dry-run scalability and Apply scalability are separate release concerns. A large file passing validation is not sufficient evidence that the database apply path is request-scale safe.
- `lib/onboarding/import.ts` uses `ONBOARDING_INLINE_ACTIVATION_MAX_ROWS = 25`. Imports above that threshold use the client-scale path: missing account numbers are allocated with batched collision checks; User, HomeownerProfile, UserRoleAssignment, account-number reservation, opening-balance Bill/DataMigration, and audit rows use bounded `createMany` batches inside one tenant-scoped serializable transaction with an explicit `ONBOARDING_IMPORT_TRANSACTION_TIMEOUT_MS = 300_000` ceiling.
- Client-scale imports do not synchronously generate thousands of bcrypt activation credentials or send thousands of emails during the Apply request. Emailed homeowners are created as active operational records with valid unique account numbers, `activationStatus = NOT_INVITED`, `emailStatus = UNVERIFIED`, and no activation credential/token. `activationInvitationsDeferred` records how many invitations remain to send.
- Deferred invitations are issued later through the existing authenticated `/admin/homeowners` activation workflow, which creates each homeowner's unique activation credential/token and attempts delivery under the normal audit controls. Do not create shared activation credentials or expose the non-authenticating import placeholder.
- Small imports of 25 rows or fewer retain the established immediate invitation behavior: emailed rows receive independently generated activation credentials/tokens and email delivery is attempted only after the database transaction commits; no-email rows remain `NOT_INVITED`.
- Client-scale database writes must not regress to per-row account-number database probes, per-row reservation/audit inserts, or synchronous bulk email delivery in the Server Action. If scale beyond 5,000 rows is required, redesign around persisted import batches/background execution rather than raising request bounds without evidence.
- A failed client-scale database transaction must roll back the imported records. Conversely, if onboarding state already records `import.appliedAt` for the file hash, do not re-import the same file; inspect the applied state/homeowner directory instead.
- `lib/onboarding/csv.ts`, `lib/onboarding/import.ts`, `lib/onboarding/policy.ts`, `app/admin/onboarding/page.tsx`, `tests/unit/onboarding-csv.test.ts`, `tests/unit/onboarding-large-import-performance.test.ts`, `tests/integration/onboarding-database.test.ts`, and `tests/integration/onboarding-large-apply-database.test.ts` are the principal regression surface. Tests must prove 2,051 valid rows parse, above-ceiling input is rejected, small imports retain immediate activation, and a client-scale (>25-row) database apply creates all records while deferring activation credentials/emails.
- Do not reintroduce a hard-coded 500-row ceiling in UI, parser, validation, or apply paths, and do not weaken file-size validation, authorization, tenant isolation, exact-file validation, duplicate detection, opening-balance auditability, or replay protection to obtain scale.

## Resident Messaging Privacy and Message Requests

- Resident directory discovery is same-tenant active-homeowner only.
- Homeowner discovery supports name, block, lot, and block+lot, but never exposes private email/phone or full/street/property address.
- `lib/services/homeowner-chat-view.ts` is the homeowner-safe payload boundary; sanitize payloads before returning them to a homeowner.
- `/api/chat/homeowners` selects minimum safe directory fields only.
- Homeowner Messenger is mobile-first and uses `components/homeowner-messenger.tsx`.
- `residentMessagingMode` values are `INBOX`, `REQUESTS`, or `NONE`; default is `REQUESTS`.
- Pending/declined requests remain outside normal Chats until accepted. Tenant-scoped resident blocks are enforced server-side on conversation creation and every send.
- `HOA Official` is derived from authenticated server roles, never the browser.
- Homeowner avatar access through `/api/profile/photo/[userId]` requires authenticated same-tenant authority and never exposes storage paths.

## Homeowner Profile and Premium UI

- `/portal/profile` prioritizes photo, name, block/lot, account number, status, and monthly dues, with detailed household/security information under compact disclosure.
- Homeowners may manage only their own authenticated profile photo. Accepted formats are JPEG/PNG/WebP up to 5 MB; server validates real signatures.
- Photo storage and metadata are tenant/user scoped, authenticated, audited, and never exposed as raw storage paths.
- Prefer icon-led rows, tabs, chips, compact summaries, and disclosures over large decorative card grids.
- Reuse `components/portal-mobile-shell.tsx` patterns and keep Payment, Requests, Community, Messaging, and Profile viewport/touch safe.

## Homeowner Statement of Account and Payment Authority

- `/portal/soa` screen and print output are separate presentation surfaces over the same authenticated tenant-scoped SOA payload.
- `Net account balance` remains dominant; secondary aging/ledger/payment/billing histories may use progressive disclosure on screen.
- `Print SOA` must be complete independent of disclosure state and must not add an admin-only verification URL QR.
- Current financial state is derived from authoritative posted ledger/SOA evidence, not an older failed attempt.
- If billing exists and current outstanding balance is `<= 0`, current status is Fully Paid even if an earlier payment request was rejected/cancelled.
- Historical failed attempts remain audit history but do not override settled current status.
- PayMongo posting occurs only from verified gateway processing and the normal transactional ledger/receipt path.
- Browser redirects/query parameters cannot create receipts or financial postings.

## Tenant Homeowner Payment Choice and PayMongo Linked Accounts

- Tenant admins with `TENANT_SETTINGS_MANAGE` must have discoverable access to `/admin/settings/payments`; Premium Admin navigation changes must not hide this operational setup route.
- Each tenant selects exactly one flow for new homeowner payment attempts: `MANUAL_QR` or `PAYMONGO`. Existing tenants fail safely to `MANUAL_QR` when no setting is present.
- Manual QR remains tenant-owned configuration and uses the existing GCash QR/proof-verification workflow. PayMongo-origin requests remain gateway-controlled and cannot be manually approved/rejected before verified gateway confirmation.
- HOAHub uses PayMongo's platform/Linked Accounts model for homeowner online collections. The platform credential is `PAYMONGO_HOMEOWNER_SECRET_KEY` and remains a deployment secret; tenant admins do not enter, view, store, or receive that API key.
- The tenant-specific PayMongo value stored by HOAHub is the linked child merchant organization ID (`org_...`) under `PAYMONGO_LINKED_ACCOUNT_ID`. This is not a secret, but it is resolved from authenticated tenant context and never accepted from the homeowner browser as authority.
- HOAHub creates homeowner Checkout Sessions with the platform credential plus `Account-ID: <tenant org_...>`. When PayMongo Online is enabled, HOAHub creates/enables the child-scoped `checkout_session.payment.paid` webhook and stores that child webhook's ID/signing secret as tenant-scoped settings.
- The current child webhook signing secret must be verified before processing payment data. Tenant, child organization ID, payment request, amount, currency, and immutable gateway identifiers must match before ledger/receipt posting.
- HOAHub SaaS subscription billing remains isolated and continues to use `PAYMONGO_SECRET_KEY` / `PAYMONGO_WEBHOOK_SECRET`; do not reuse those credentials for homeowner collections.
- HOAHub convenience-fee split routing remains platform-controlled and uses `PAYMONGO_HOMEOWNER_PARENT_ACCOUNT_ID` when enabled. Tenant admins cannot alter the platform fee from homeowner payment setup.
- `components/sidebar-links.ts`, `app/admin/settings/payments/page.tsx`, `lib/actions/homeowner-payment-settings.ts`, `lib/services/homeowner-payment-config.ts`, `lib/services/homeowner-paymongo.ts`, and `tests/unit/homeowner-payment-flow.test.ts` are the principal regression surface for this contract.

### PayMongo Gateway Status and Finance Reconciliation

- A browser success/cancel redirect is presentation only. Financial posting authority is either the verified child-scoped PayMongo webhook or authenticated server-to-server Checkout Session retrieval using the platform homeowner secret plus the snapshotted tenant `Account-ID`.
- Server reconciliation must validate the expected tenant, homeowner, linked child account, HOAHub `HOP-...` reference, checkout/payment identifiers, PHP currency, and paid amount/fee metadata before invoking finance posting.
- An active PayMongo Checkout Session can contain multiple payment attempts. `awaiting_payment_method` with `last_payment_error` is a retryable unsuccessful attempt, not a terminal HOAHub rejection. It remains `PENDING_REVIEW`, remains unposted to finance, and may resume the same Checkout Session.
- `awaiting_next_action` maps to Awaiting Customer Action; `processing` maps to Processing. Both remain non-financial pending states until PayMongo exposes a paid Payment resource.
- Only a verified paid Payment resource may transition the HOAHub request to the normal `approvePaymentRequest(..., { allowGatewayConfirmation: true })` path. Successful posting must create/reuse the official receipt/payment or collection, update bill allocations/balances, and remain idempotent on webhook/retrieval retries.
- Monthly-dues `Payment` rows intentionally keep `billId = null`; the authoritative bill linkage is `PaymentRequest.paymentId -> Payment -> PaymentAllocation -> Bill`. Regression tests must assert the allocation and the payment idempotency key rather than a legacy direct `Payment.billId` relationship.
- Checkout `expired` and homeowner cancellation are terminal non-financial states. Cancellation must first reconcile with PayMongo so an already-paid provider transaction cannot be locally cancelled by a late browser action.
- `/api/homeowner-payments/paymongo/status` is a same-origin authenticated POST. Tenant/homeowner scope comes only from the authenticated session; no browser-supplied tenant, homeowner, child account, amount, or payment status is accepted as authority.
- The homeowner PayMongo UI may poll the authenticated status endpoint to display Awaiting Payment, Awaiting Customer Action, Processing, Payment Unsuccessful — Retry Available, Paid & Reconciled, Payment Cancelled, Checkout Expired, or Status Temporarily Unavailable. A UI status refresh may trigger server reconciliation but cannot manufacture a financial state.
- `/admin/payments/online` is the Tenant Admin operational monitor for gateway state versus finance state. It remains tenant scoped and does not create a manual approval bypass for PayMongo-origin requests.
- `lib/paymongo-gateway-status.ts`, `lib/services/homeowner-paymongo-reconciliation.ts`, `app/api/homeowner-payments/paymongo/status/route.ts`, `components/paymongo-payment-status-sync.tsx`, `app/admin/payments/online/page.tsx`, `app/portal/pay/paymongo-cancel/route.ts`, `tests/unit/paymongo-gateway-status.test.ts`, and `tests/integration/paymongo-homeowner-reconciliation.test.ts` are the principal regression surface for the end-to-end status/reconciliation contract.

## Community Intelligence UI System — Phase 3 Baseline

- Existing `pine`, `leaf`, `ink`, `sand`, `.card`, `.field`, `.btn-*`, `.table-wrap`, and `.data-table` remain supported; do not introduce a parallel design framework without an approved migration.
- Platform control-plane identity uses HOAHub branding, never a customer/tenant logo.
- `/admin/actions` is an aggregator only and delegates to authoritative Payment, Billing, Document, Payroll, and Complaint workflows.
- Resident 360 remains tenant-scoped and must not expose confidential complaint identity data.
- `/admin/workforce` requires payroll access and tenant-scoped workforce/payroll queries.
- `/platform/ai-usage` exposes metadata only, not prompt/response content.
- `/platform/audit` is read-only evidence over existing `AuditLog` records.
- Official document output/print CSS and production Gate Pass / Move In-Out templates remain outside visual redesign authority.
- Complaint/grievance privacy, verification, committee/identity, deadline, and reporting controls remain unchanged by UI-only initiatives.
- Navigation-sidebar Canva styling must remain scoped to the actual fixed navigation aside; page-level `<aside>` content must not inherit navigation width/gradient styles.

### Canva Visual Parity Contract

- Approved palette baseline: navy `#071f31`, navy2 `#0b2e46`, pine `#0d4f46`, technology blue `#0b95d8`, blue2 `#27b6ff`, community green `#6ed64b`, neutral canvas `#f3f8fb`.
- Tenant UI uses restrained navy/teal navigation, neutral canvas, white executive surfaces, technology-blue interactions, and green primarily for positive/community state.
- Platform UI is visually distinct and dark, with HOAHub control-plane identity.
- KPI cards use restrained executive surfaces; rejected colored vertical side-strip treatment must not return.
- Homeowner/PWA keeps blue/teal mobile hierarchy, compact account health/shortcuts, floating bottom navigation, safe areas, and approximately 48px+ touch targets.
- Functional mockup controls must connect to real existing routes/actions. Mockup-only sample values must never be presented as real production metrics.
- `.github/workflows/ui-canva-parity.yml` builds the exact candidate with CI MySQL and controlled Chromium, captures actual browser screenshots, and uploads comparison evidence.

## Complaint-to-Grievance Foundation — BRD v1.0

Approved baseline: `docs/complaints/HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`.

Mandatory architecture rule: Complaint remains the intake/operational case layer; formal grievance/compliance remains a separate domain. Do not expand `ComplaintStatus` into a monolithic notice/mediation/hearing/board/appeal state machine.

- Anonymous complaint session tokens are HttpOnly browser state; only digests are persisted. Anonymous sessions must not recreate resident identity linkage.
- Anonymous APIs expose PUBLIC content only and never expose internal/confidential notes, identities, emails, private IDs, storage paths, or private timeline data.
- State-changing anonymous requests enforce same-origin policy and no-store responses; retries remain idempotent and bounded.
- Complaint subject/person/property is distinct from incident location. Vehicle/homeowner relationships are revalidated inside authenticated tenant scope.
- Verification is policy-driven; anonymity/named status is not proof strength. Configured enforcement/formal transitions fail closed until required independent verification passes.
- Confidential identity reveal is separately authorized, reasoned, confirmed, no-store, and audited.
- Grievance committee appointments grant only selected grievance authority and never unrelated finance/platform permissions. Platform roles cannot inherit tenant grievance authority.
- `GrievanceDeadline` remains separate from `Complaint.dueAt` operational SLA. Do not hard-code a universal legal period.
- Complaint, verification, grievance, committee, and deadline evidence must remain tenant-scoped and transactional where the service contract requires atomic history/audit writes.

Deferred grievance scope remains notice/proof-of-service, mediation/hearing records, witness/exhibit/minutes management, evidence vault/provenance, formal board vote/quorum/recusal/decision, appeal/reconsideration, resolution agreement/e-signature, regulatory dossier export, retention/legal hold automation, advanced redaction/notifications, and real malware-scanner integration unless the BRD is revised.

## Flexible Collection Payers — PR #137

- Prisma `PayerType` is the single payer authority and supports `HOMEOWNER`, `CONTRACTOR`, `RENTER`, and `OTHER`. Do not introduce a parallel payer category column or raw-SQL compatibility authority.
- `Collection.payerName` is nullable and stores the bounded free-text payer identity only for `RENTER` and `OTHER`; do not fabricate Homeowner, User, or Contractor records for external payers.
- External payer types are allowed only for `CollectionType.OTHER`. Construction Bond remains Homeowner-only and Contractor Bond remains Contractor-only.
- Existing homeowner/contractor selectors, tenant-scoped existence checks, receipt numbering, finance treatment, bond liabilities, refunds, forfeitures, and audit controls remain unchanged.
- Collection history/search, HTML receipt, PDF receipt, finance CSV export, and receipt audit metadata must display/preserve the external payer name and first-class payer type.
- Migration `20260821234500_flexible_collection_payers` expands the existing MySQL `payerType` enum in place and adds nullable `payerName`, preserving existing HOMEOWNER/CONTRACTOR rows.
- `prisma/schema.prisma`, `lib/validation.ts`, `components/collection-form.tsx`, `lib/actions/collections.ts`, `app/admin/collections/page.tsx`, receipt HTML/PDF routes, finance export, migration, and `tests/unit/flexible-collection-payers-surface.test.ts` are the principal regression surface.

## Rental Management MVP — PR #138

- Rental management is tenant-scoped and covers rentable assets, renters, agreements, rental receivables, and allocation of existing Collection receipts.
- Outside renters remain standalone renter records. Do not create fake User or Homeowner records; `homeownerId` is optional and only links a same-tenant existing homeowner.
- Collection remains the cash and receipt authority. RentalPaymentAllocation is reconciliation only and must not duplicate cash, overpay an invoice, over-allocate a receipt, or cross tenant boundaries.
- Only eligible non-refundable `CollectionType.OTHER` receipts may be allocated to rental invoices. Payer compatibility must be validated before allocation.
- Rental security deposits are refundable liabilities and must never be reported as rental income. Rent charges are rental income when collected.
- Rental finance writes remain under existing `BILLING_MANAGE` authority for this MVP. Do not broaden RBAC implicitly.
- Rental SQL access must include explicit `tenantId` predicates and state-changing agreement/invoice/allocation workflows use serializable transactions where concurrent balance or occupancy changes matter.
- Monthly invoice generation is idempotent per tenant/agreement/charge type/period. Ending an agreement releases the asset without deleting historical invoices or allocations.
- Principal regression surface: `app/admin/rentals/page.tsx`, `lib/actions/rentals.ts`, `prisma/migrations/20260822071500_rental_management_mvp/migration.sql`, `app/admin/reports/export/route.ts`, `components/sidebar-links.ts`, and `tests/unit/rental-management-mvp.test.ts`.
- Future PayMongo renter payment flows may settle through the existing Collection + RentalPaymentAllocation model only after live webhook authority, idempotency, and tenant isolation are separately verified.

## Rental Accounting & Search UX Hotfix — PR #139

- Refundable rental security deposits are cash receipts/liabilities, not recognized income. Financial web/PDF/DOCX reports must subtract only `SECURITY_DEPOSIT`-allocated amounts from Other Income revenue while keeping those amounts in cash receipts as `Rental security deposits received (liability)`.
- Partial or mixed rental receipts are accounted by allocation amount, not by classifying the whole Collection row.
- Rental renter onboarding must provide searchable homeowner linking and support the client-scale homeowner directory up to the existing 5,000-row onboarding ceiling.
- Rental invoice reconciliation must provide a searchable existing-receipt selector, filter eligible receipts to the invoice renter/homeowner before display, and keep server-side payer/tenant/over-allocation validation authoritative.
- `Record renter payment` is the cash-receipt step; `Apply existing receipt` is reconciliation to an existing rental invoice. Do not collapse these concepts in labels or accounting.
- `lib/rental-accounting.ts`, `lib/services/financial-report.ts`, `app/admin/reports/page.tsx`, PDF/DOCX report routes, `app/admin/rentals/page.tsx`, and `tests/unit/rental-management-mvp.test.ts` are the principal regression surface for this hotfix.

## Hostinger Production Deployment Model

The authoritative production path is the Hostinger managed Node.js application connected to GitHub `main`.

- Feature branches are not production deployment targets.
- Approved production changes land on `main` through GitHub.
- Push/merge to `main` runs HOAHub verification and triggers Hostinger connected-GitHub auto-deployment.
- Node.js production runtime is 22.x.
- `scripts/write-release-id.mjs` stamps the short Git revision into `public/release.txt` before build.
- Hostinger's install layer may use pnpm while managed build subprocesses may not expose pnpm in `PATH`; lifecycle commands must invoke Node scripts/package binaries directly rather than assuming nested `pnpm` is available.
- Legacy PM2/SSH activation is not the authoritative managed-web-app deployment path.
- Never expose or print production `.env` contents.

### Production Release Identification

A release is deployed only when all are true:
1. the expected merged `main` commit passed repository verification;
2. Hostinger auto-deployment published that build;
3. production `/release.txt` equals the expected 12-character short `main` SHA; and
4. production `/api/health` succeeds.

The `deploy-production` job in `.github/workflows/ci-deploy.yml` performs the release-marker wait and public health check after successful `main` verification.

## CI Browser Gate Recovery

- GitHub Actions uses repository-provided `@sparticuz/chromium` via `PUPPETEER_EXECUTABLE_PATH`.
- Browser isolation uses the reviewed bounded context/process strategy.
- Cleanup may force-kill failed browser processes but must not relax business assertion timeouts.
- Retry remains limited to explicitly recognized transient browser-startup signatures, not business assertion failures.

## Standard Exact-Head Validation Gate

Before merge/deploy of runtime changes, the exact candidate must pass applicable full gates:
- `pnpm install --frozen-lockfile`
- `pnpm lint`
- Prisma validate/generate/migrate on clean CI MySQL
- database seed
- unit tests
- integration tests
- critical/static verification
- typecheck
- production build
- controlled Chromium preparation
- production smoke and critical browser/E2E tests
- Canva Visual Parity for UI initiatives

Critical/static verification is split into named CI substeps for diagnosability. Each verifier remains mandatory; a later step never substitutes for a failed earlier one.

Do not merge a known failure merely to trigger deployment. Fix the defect or update a brittle source-contract assertion only when the revised assertion continues to protect the intended security/business invariant.

## Change Discipline

For every repository change:
- read the implementation, tests, and relevant security boundaries first;
- keep tenant/user authority server-controlled;
- update/add regression tests when behavior changes;
- preserve homeowner mobile/PWA acceptance for user-facing changes;
- preserve the Hostinger managed deployment/release-marker model;
- update `Agent.md` and relevant BRD/status/traceability records before merge/deployment; and
- never report production deployment until release marker, health, and applicable production UAT are verified.