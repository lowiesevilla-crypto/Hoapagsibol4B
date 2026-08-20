# HOAHub Agent Context

Last updated: 2026-08-20

## Purpose

This file is the repository-level operating context for AI coding agents and maintainers working on HOAHub. Production safety, tenant isolation, authentication integrity, mobile/PWA usability, auditable deployment, and repository-context maintenance are release gates.

## Mandatory Agent.md Maintenance

`Agent.md` must be reviewed and updated for **every repository change** before that change is merged or deployed.

For every branch/PR/change:

1. Read `Agent.md` before implementation.
2. Update relevant context, architecture, files, tests, rollback, and deployment state.
3. Keep `Last updated` current.
4. Never place credentials, tokens, production passwords, private keys, certificates, or secret values in this file.
5. Do not merge or deploy while this file is stale.

A missing or stale `Agent.md` update is an incomplete change.

## Product and Architecture Baseline

- HOAHub is a multi-tenant community/homeowners-association SaaS platform.
- Primary stack: Next.js, React, TypeScript, Tailwind CSS, Prisma, and MySQL.
- Production hosting: Hostinger managed Node.js web application connected to GitHub `main`.
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

Homeowner-facing changes are phone/PWA-first, not desktop-only.

- Use dynamic viewport behavior (`100dvh`) when full-height layout is needed.
- Respect `env(safe-area-inset-top/right/bottom/left)`.
- Keep primary touch targets approximately 48px where practical.
- Avoid hover-only interaction and horizontal overflow.
- Use shrink-safe `min-w-0`/`max-w-full` patterns where content can compress.
- Honor `prefers-reduced-motion` for non-essential animation.
- Ensure critical forms/cards can scroll on short phone viewports without hiding primary actions behind the keyboard or bottom navigation.
- Preserve passkey support on compatible devices.
- The root application layout owns the single `PwaInstallProvider`; do not reintroduce another provider in `app/portal/layout.tsx`.
- Private portal HTML, payments, receipts, documents, uploads, Server Actions, RSC, and router-prefetch traffic remain network-only/no-store under the reviewed PWA/cache policy.
- Public install prompting uses browser-supported installability events; do not claim universal device-level installed-PWA detection.

## Authentication and Account Selection

### Community Pulse Login Boundary

Community Pulse is presentation only. It must not replace or bypass the existing server authentication action, tenant/account selection, session validation, passkey verification, or safe redirect logic.

- Pending credential authentication displays `Verifying access…`.
- `Access verified` is shown only after the server returns a valid authenticated redirect target.
- Non-essential login/post-login animation honors reduced motion.
- `lib/tenant-logo.ts` is server-only; client code must not import Node-only tenant-logo storage logic.

### Multi-Account Login Selection

A credential identity matching multiple active HOA/tenant accounts authenticates once and then chooses an authorized account.

- The server creates a short-lived signed `hoa_login_choice` cookie containing only allowed user IDs and purpose metadata.
- The cookie is `HttpOnly`, `SameSite=Lax`, secure in production, and short-lived.
- The second step sends `selectedUserId` only; credentials are not retained in React state, hidden fields, browser storage, or the choice cookie.
- A selected account is accepted only if present in the signed choice and is revalidated active with its tenant before session creation.
- Missing/tampered/expired choice state fails closed.
- Session/audit/last-login persistence occurs through server authority before issuing the browser session cookie.
- Tenant isolation remains mandatory after account selection.

### Post-Login Brand Handoff

`hoahub.login.handoff.v1` is a short-lived browser presentation marker written only after successful credential/passkey authentication. It contains a local timestamp only and never identity, tenant, session, or credential data. Browser-storage failure must not affect authentication or navigation.

## Authentication Navigation Recovery — PR #127 / PR #130 Follow-up

PR #127 hardened logout, Browser Back/Forward restoration, and global error recovery across Tenant Admin, Platform Admin, Homeowner/PWA, and Employee protected surfaces. Premium Admin V2 PR #130 carries the final browser correction found by the exact-head E2E suite.

### Auth Navigation Architecture

- Shared logout authority remains same-origin `POST /api/auth/logout` with server-side session revocation, verified-login-choice cleanup, private/no-store responses, and a server-authoritative login destination.
- Protected React pages no longer submit the logout POST. `components/auth-navigation-buttons.tsx` exposes an ordinary same-origin anchor to `/api/auth/logout-transition?scope=...`, with the scope limited to `current` or `all`. It does not use a React form, client `fetch`, React action state, manual client redirect authority, or a Server Action for revocation.
- `GET /api/auth/logout-transition` is a non-mutating, private/no-store transition document outside the protected React tree. It accepts only exact/configured application referrers or browser-controlled same-origin top-level navigation metadata. Its CSP restricts form submission to self, blocks framing, and authorizes only a per-response nonce-scoped inline submitter.
- The transition document is self-contained: its nonce-scoped submitter invokes `HTMLFormElement.prototype.submit.call(form)` on the raw HTML form that posts to `/api/auth/logout`. No secondary static script request is required, so the security transition cannot stall on a service-worker/cache/static-asset path. Because the form exists in a raw route-handler document rather than the React/Next protected page, React Server Action form interception cannot reinterpret the POST.
- `app/api/auth/logout/route.ts` remains authoritative: exact same-origin validation is attempted first; only explicitly configured app-origin fallback is accepted for reverse-proxy/canonical URL mismatch; browser Fetch Metadata fallback is allowed only for same-origin top-level document navigation when usable Origin/Referer headers are absent. Session state is revoked before the private/no-store HTTP 303 response.
- Do not collapse this back into a React-managed form or direct protected-page POST. Do not replace the path with client `fetch`, `useActionState`, `requestSubmit()`, client redirect authority, or GET-based session mutation.
- Protected-route recovery listens to `pageshow` and `popstate` restoration for `/admin`, `/platform`, `/portal`, and `/employee`. Restored protected documents are reloaded so current server session/RBAC authority is re-established.
- `app/error.tsx` uses hard-document recovery for non-chunk failures and a guarded safe-entry fallback instead of repeatedly resetting the same broken React tree.
- Login/auth/private responses remain no-store. Same-origin/CSRF protections remain mandatory on logout. Tenant identity, role, and redirect authority remain server controlled.

### Permanent Regression Contract

- `tests/e2e/auth-navigation-recovery.mjs` signs in as Tenant Admin, Platform Admin, and Homeowner, exercises authenticated history navigation, clicks the real visible logout link, requires the transition POST to complete through the server 303/login navigation, then verifies Browser Back cannot revive an interactive protected document or global error state.
- The E2E selector may track the explicit `data-hoahub-logout-button` control, but the test must not bypass the UI with a direct API call.
- `verify:auth-navigation-cache`, `verify:homeowner-mobile-hardening`, and `verify:homeowner-pwa` validate the isolated transition-document architecture, same-origin/navigation proof, private/no-store/CSP boundary, nonce-scoped native submitter, final POST same-origin validation, and HTTP 303 redirect. They reject protected-page React form submission, client fetch/action-state, and client redirect authority.
- Critical CI verifiers are intentionally split into named workflow steps for diagnosability; this changes observability only, not the verification contract or release threshold.
- No Prisma schema/migration, finance authority, payroll confidentiality, complaint/grievance privacy, document/template workflow, AI governance, tenant isolation, or RBAC scope is changed by this correction.

### Auth Follow-up Release State — 2026-08-20

- PR #127 is merged; Premium Admin V2 started from main baseline `a0965d49bab5c475a75864b4e8cea5594b5a9a00`.
- Repeated PR #130 MySQL CI runs reproduced a Tenant Admin logout timeout while dependency integrity, lint, Prisma, unit/integration, business verifiers, production build/smoke, and the preceding browser suites remained green.
- The failed browser evidence first showed a protected-page logout POST being interpreted by Next as an unknown Server Action; after moving POST submission outside React, a later exact-head run showed the transition document itself could stall before the final login navigation. The current transition is therefore self-contained and nonce-scoped while preserving the same native POST and server-authoritative revocation/303 contract.
- The real-browser security postconditions are unchanged: the user must exercise the visible control, session revocation remains server authoritative, the final navigation must reach the server-approved login surface, and Browser Back must not revive protected content.
- The exact documented branch head must pass both HOAHub MySQL CI and HOAHub Canva Visual Parity before PR #130 leaves draft or merges. A passing older head is not sufficient.
- Rollback is application-level; there is no database migration for this auth-navigation change.

# Active Initiative: Premium Admin UI V2 — PR #130

Approved Canva design: `DAHSu6LXZUk` — HOAHub Premium Admin UI V2 — 42 Route Redesign.
Tracking issue: #128.
Implementation branch: `feature/premium-admin-ui-v2`.
Implementation/traceability record: `docs/ui/HOAHUB_PREMIUM_ADMIN_UI_V2_IMPLEMENTATION.md`.

## Premium Admin V2 Architecture

- The Admin UI preserves the authenticated server layout as tenant/RBAC/module/entitlement authority. Visual redesign must never make the browser authoritative for tenant, role, module, payroll, AI, document, finance, complaint, or workflow decisions.
- `components/page-header.tsx` is the canonical workspace PageHeader and supports the legacy `action` alias plus premium `actions` and `context`; `components/ui/page-header.tsx` re-exports it. Do not create another competing PageHeader implementation.
- `app/admin/layout.tsx` applies `premium-admin-workspace` at the common content boundary. `app/canva-parity.css` owns shared premium card, table, field, filter, pagination, and responsive surface treatment.
- The Admin command catalog is built server-side from authorized route definitions, then filtered by role, enabled tenant modules, Document Management entitlement, AI use/manage permission, and payroll access before serialization to `ShellCommandSearch`.
- `ShellCommandSearch` supports authorized route/section/path terms, deduplication, `Ctrl/Cmd + K`, Arrow Up/Down, Enter, Escape, and combobox/listbox semantics. Never serialize inaccessible routes merely for discoverability.
- Homeowner directory search remains under authenticated `user.tenantId`. `lib/homeowner-admin-search.ts` parses explicit Block/Lot phrases such as `block 1 lot 2` into property constraints while retaining residual name/email/account terms.
- Canva sample/mock data is never production data. Existing Prisma records, server actions, finance ledgers, document state, complaint/grievance controls, payroll confidentiality, and AI governance remain authoritative.
- Production Gate Pass / Move In-Out templates and official document output are not recreated or replaced by this UI initiative.
- No Prisma schema migration is introduced by Premium Admin V2.

## Premium Admin V2 Scope and Responsive Contract

- The tracked 42-route inventory spans Settings/Account, Dashboard/Onboarding/Residents, Finance/Payments/Reports/Data, Document Operations/Repository, Complaints, AI, Chat, Attendance, and Payroll.
- All scoped routes inherit the shared premium workspace boundary and canonical PageHeader presentation while retaining route-specific data/actions.
- Tables remain contained within operational scroll surfaces instead of causing page-level horizontal overflow.
- Essential Admin actions remain reachable at desktop/tablet/mobile widths; shared Admin mobile treatment preserves practical touch sizes.
- Visual-parity evidence covers representative desktop workspaces across Settings, Onboarding, Homeowners, Action Center, Billing, Payment Requests, Reports, Data, Documents, Document Repository, Complaints, Chat, and Workforce; tablet/mobile captures cover high-value responsive routes.

## Premium Admin V2 Search Release Gate

- Search is a release blocker, not decorative UI.
- `tests/unit/homeowner-admin-search.test.ts` covers structured Block/Lot parsing and generated Prisma conditions.
- `tests/e2e/admin-premium-search.mjs` logs in with the seeded Admin, uses keyboard command search to navigate to Homeowners, performs a real combined Block/Lot lookup against seeded tenant data, and verifies the empty-result state.
- The browser search regression remains part of `test:e2e`; do not remove or bypass it to obtain green CI.
- Existing route-level search controls remain server/tenant scoped and preserve reset/pagination semantics.

## Premium Admin V2 Release State — 2026-08-20

- Implementation is complete. PR #130 remains draft until its exact final branch head passes both HOAHub MySQL CI and HOAHub Canva Visual Parity.
- CI has already proven dependency integrity, lint, Prisma validate/generate/migrate/seed, 295 unit tests, 30 integration tests, critical business verifiers, typecheck, production build/smoke, core business browser flow, onboarding, document workflow, Document Management, RBAC stale-session, AI assistant, and Premium Admin command/combined Block-Lot search. The remaining release proof is the corrected real-browser logout/history path on the exact documented head.
- The logout correction is intentionally narrow: protected React pages perform only a same-origin navigation to an isolated no-store transition document; that self-contained nonce-scoped document performs the native POST; server CSRF/session/303 authority and the real-browser security postconditions remain unchanged.
- `docs/ui/HOAHUB_PREMIUM_ADMIN_UI_V2_IMPLEMENTATION.md` records route waves, visual evidence, search coverage, and release gates.
- After exact-head green, the user has authorized marking PR #130 ready, merging the verified head to `main`, and proceeding through the existing Hostinger managed deployment without another approval prompt.
- Production completion requires the merged `main` verification/deploy workflow to pass, Hostinger to serve the expected 12-character merge SHA at `/release.txt`, `/api/health` to succeed, and applicable production UI/search smoke evidence to pass.
- Do not claim a separate live-tenant authenticated sign-off unless such a production session was actually executed.
- Rollback is application-level: revert the PR #130 merge if necessary while preserving all business data.

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

# Community Intelligence UI System — Phase 3 Baseline

Phase 3, Canva remediation PR #125, and content-aside scope hotfix PR #126 established the shared premium ecosystem baseline that Premium Admin V2 extends.

- Existing `pine`, `leaf`, `ink`, `sand`, `.card`, `.field`, `.btn-*`, `.table-wrap`, and `.data-table` remain supported; do not introduce a parallel design framework without an approved migration.
- Platform control-plane identity uses HOAHub branding, never a customer/tenant logo.
- `/admin/actions` is an aggregator only and must delegate to authoritative Payment, Billing, Document, Payroll, and Complaint workflows.
- Resident 360 remains tenant-scoped and must not expose confidential complaint identity data.
- `/admin/workforce` requires payroll access and tenant-scoped workforce/payroll queries.
- `/platform/ai-usage` exposes metadata only, not prompt/response content.
- `/platform/audit` is read-only evidence over existing `AuditLog` records.
- Official document output/print CSS and production Gate Pass / Move In-Out templates remain outside visual redesign authority.
- Complaint/grievance privacy, verification, committee/identity, deadline, and reporting controls remain unchanged by UI-only initiatives.
- Navigation-sidebar Canva styling must stay scoped to the actual fixed navigation aside; page-level `<aside>` content must not inherit forced navigation width/gradient styles.

## Canva Visual Parity Contract

- Approved palette baseline: navy `#071f31`, navy2 `#0b2e46`, pine `#0d4f46`, technology blue `#0b95d8`, blue2 `#27b6ff`, community green `#6ed64b`, neutral canvas `#f3f8fb`.
- Tenant UI uses restrained navy/teal navigation, neutral canvas, white executive surfaces, technology-blue interactions, and green primarily for positive/community state.
- Platform UI is visually distinct and dark, with HOAHub control-plane identity.
- KPI cards use restrained executive surfaces; rejected colored vertical side-strip treatment must not return.
- Homeowner/PWA keeps blue/teal mobile hierarchy, compact account health/shortcuts, floating bottom navigation, safe areas, and approximately 48px+ touch targets.
- Functional mockup controls must connect to real existing routes/actions. Mockup-only sample values must never be presented as real production metrics.
- `.github/workflows/ui-canva-parity.yml` builds the exact candidate with CI MySQL and controlled Chromium, captures actual browser screenshots, and uploads the comparison artifact.

# Complaint-to-Grievance Foundation — BRD v1.0

Approved baseline: `docs/complaints/HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`.

The architecture rule is mandatory: **Complaint remains the intake/operational case layer; formal grievance/compliance remains a separate domain.** Do not expand `ComplaintStatus` into a monolithic notice/mediation/hearing/board/appeal state machine.

## Grievance Foundation Status

- Phase 1 implementation and exact-main automated validation are complete; PR #122 merged and was deployed/verified.
- Anonymous two-way text messaging, structured subject, independent verification, separate grievance case, tenant committee appointments, and separate formal deadlines are implemented as additive domains.
- Future grievance changes must preserve tenant isolation, privacy, auditability, mobile/PWA behavior, compatibility, and exact-head release validation.

## Grievance Release Gates

- Anonymous complaint session tokens are HttpOnly browser state; only digests are persisted. Anonymous sessions must not recreate resident identity linkage.
- Anonymous APIs expose PUBLIC content only and never expose internal/confidential notes, identities, emails, private IDs, storage paths, or private timeline data.
- State-changing anonymous requests enforce same-origin policy and no-store responses; retries remain idempotent and bounded.
- Complaint subject/person/property is distinct from incident location. Vehicle/homeowner relationships are revalidated inside authenticated tenant scope.
- Verification is policy-driven; anonymity/named status is not proof strength. Configured enforcement/formal transitions must fail closed until required independent verification passes.
- Confidential identity reveal is separately authorized, reasoned, confirmed, no-store, and audited.
- Grievance committee appointments grant only selected grievance authority and never unrelated finance/platform permissions. Platform roles cannot inherit tenant grievance authority.
- `GrievanceDeadline` remains separate from `Complaint.dueAt` operational SLA. Do not hard-code a universal legal period.
- Complaint, verification, grievance, committee, and deadline evidence must remain tenant-scoped and transactional where the existing service contract requires atomic history/audit writes.

## Deferred Grievance Scope

Unless the BRD is explicitly revised, later phases retain notice/proof-of-service, mediation/hearing records, witness/exhibit/minutes management, evidence vault/provenance, formal board vote/quorum/recusal/decision, appeal/reconsideration, resolution agreement/e-signature, regulatory dossier export, retention/legal hold automation, advanced redaction/notifications, and real malware-scanner integration.

# Hostinger Production Deployment Model

The authoritative production path is the Hostinger managed Node.js web application connected to GitHub `main`.

- Feature branches are not production deployment targets.
- Approved production changes land on `main` through GitHub.
- Push/merge to `main` runs HOAHub verification and triggers Hostinger connected-GitHub auto-deployment.
- Node.js production runtime is 22.x.
- `scripts/write-release-id.mjs` stamps the short Git revision into `public/release.txt` before build.
- Hostinger's install layer may use pnpm while managed build subprocesses may not expose pnpm in `PATH`; production lifecycle commands must invoke Node scripts/package binaries directly rather than assuming nested `pnpm` is available.
- Legacy PM2/SSH activation is not the authoritative managed-web-app deployment path.
- Never expose or print production `.env` contents.

## Production Release Identification

A release is deployed only when all of these are true:

1. the expected merged `main` commit passed repository verification;
2. Hostinger auto-deployment published that build;
3. production `/release.txt` equals the expected 12-character short `main` SHA; and
4. production `/api/health` succeeds.

The `deploy-production` job in `.github/workflows/ci-deploy.yml` performs the release-marker wait and public health check after a successful `main` verification run.

For Premium Admin V2, PR #130 is authorized for automatic ready/merge/deploy only after its exact final head passes HOAHub MySQL CI and Canva Visual Parity. Production completion additionally requires the green main deployment job and applicable authenticated UI/search smoke evidence. Do not fabricate live authenticated production sign-off if credentials/session access are unavailable.

## CI Browser Gate Recovery

- GitHub Actions uses repository-provided `@sparticuz/chromium` via `PUPPETEER_EXECUTABLE_PATH`.
- Browser isolation uses the reviewed bounded context/process strategy; do not reintroduce unstable isolation behavior without proof.
- Cleanup may force-kill failed browser processes but must not relax business assertion timeouts.
- Retry remains limited to explicitly recognized transient browser-startup signatures, not business assertion failures.

## Standard Exact-Head Validation Gate

Before merge/deploy of runtime changes, the exact candidate must pass the applicable full gate, including:

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

The critical/static verification stage is split into named CI substeps so failures identify the affected contract quickly; each verifier remains mandatory and a later step is never a substitute for a failed earlier one.

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
