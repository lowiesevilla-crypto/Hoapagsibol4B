# HOAHub Agent Context

Last updated: 2026-08-17

## Purpose

This file is the repository-level operating context for AI coding agents and maintainers working on HOAHub. Production safety, tenant isolation, authentication integrity, mobile/PWA usability, auditable deployment, and repository-context maintenance are release gates.

## Mandatory Agent.md Maintenance

`Agent.md` must be reviewed and updated for **every repository change** before that change is merged or deployed.

For every branch/PR/change:

1. Read `Agent.md` before implementation.
2. Update the relevant context, architecture, files, tests, rollback, and deployment state.
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
4. Never commit production secrets or expose them in logs/client/model payloads.
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
- The root application layout owns the single `PwaInstallProvider`; do not reintroduce a second provider in `app/portal/layout.tsx`.
- Public install prompting uses browser-supported installability events; do not claim universal device-level installed-PWA detection.

## Current Release: Community Pulse Premium Login

Community Pulse is the premium HOAHub login experience introduced through PR #103 and later hardened for mobile/PWA, web, multi-account login, and post-login handoff.

### Login and Authentication Boundary

Community Pulse is presentation only. It must not replace or bypass the existing server authentication action, tenant/account selection, session validation, passkey verification, or safe redirect logic.

- Idle login may animate blue/green pulse/orbit effects around a visually stable HOAHub/tenant logo.
- Pending credential authentication displays `Verifying access…`.
- `Access verified` is shown only after the server returns a valid authenticated redirect target.
- The visible confirmation window is short and non-authoritative; authentication remains server/session controlled.
- All non-essential motion honors reduced motion.

### Multi-Account Login Selection

A credential identity matching multiple active HOA/tenant accounts authenticates once and then chooses an authorized account.

- The server creates a short-lived signed `hoa_login_choice` cookie containing only allowed user IDs and purpose metadata.
- The cookie is `HttpOnly`, `SameSite=Lax`, secure in production, and short-lived.
- The second step sends `selectedUserId` only; credentials are not retained in React state, hidden fields, browser storage, or the choice cookie.
- A selected account is accepted only if present in the signed choice and is revalidated active with its tenant before session creation.
- Missing/tampered/expired choice state fails closed.
- Session/audit/last-login persistence occurs through server authority before issuing the browser session cookie.
- Tenant isolation remains mandatory after account selection.
- Regression: `tests/unit/login-multi-account-selection.test.ts` and `tests/unit/homeowner-multi-account-surface.test.ts`.

### Post-Login Brand Handoff

`hoahub.login.handoff.v1` is a short-lived browser presentation marker written only after successful credential/passkey authentication.

- It contains only a local timestamp, never identity/tenant/session/credential data.
- `AssociationLogo` uses the shared `PostLoginBrandOrbit` wrapper.
- Login/reset routes do not consume it.
- It expires quickly and is removed after one short authenticated-shell orbit.
- Browser storage failure must not affect authentication/navigation.

### Client/Server Branding Boundary

`lib/tenant-logo.ts` imports Node-only APIs and is server-only. Client components must not import it simply to reuse constants. Resolve the logo on the server or use the static `/Hoahub-logo.png` defensive fallback in browser-only code.

## Resident Messaging Privacy and Message Requests

The homeowner `/portal/chat` experience supports same-tenant resident messaging plus verified HOA personnel communication.

- Resident directory discovery is same-tenant active-homeowner only.
- Homeowner discovery supports name, block, lot, and block+lot, but never exposes private email/phone or full/street/property address.
- `lib/services/homeowner-chat-view.ts` is the homeowner-safe payload boundary. Sanitize payloads before returning them to a homeowner.
- `/api/chat/homeowners` selects minimum safe directory fields only.
- Homeowner Messenger is mobile-first and uses `components/homeowner-messenger.tsx` rather than the generic desktop workspace component.
- `residentMessagingMode` values are `INBOX`, `REQUESTS`, or `NONE`; default is `REQUESTS`.
- Pending/declined requests remain outside normal Chats until accepted. Declined requests block further sends unless a future approved lifecycle changes that rule.
- Tenant-scoped resident blocks are enforced server-side on conversation creation and every send.
- `HOA Official` is derived from authenticated server roles, never the browser.
- Homeowner avatar access through `/api/profile/photo/[userId]` requires authenticated same-tenant authority and never exposes storage paths.
- Core regression includes homeowner chat privacy/PWA/mobile tests.

## Homeowner Profile UI and Photo Upload

`/portal/profile` is a compact mobile identity surface.

- Primary hierarchy: profile photo, name, block/lot, account number, status, and monthly dues.
- Detailed household/security information uses compact disclosure sections.
- Homeowners may manage only their own authenticated profile photo.
- Accepted upload formats are JPEG/PNG/WebP up to 5 MB; client validation is convenience only, server checks file signature.
- Photo storage is tenant/user scoped and served through authenticated routes, never a raw public upload path.
- Metadata writes/removals are audit logged and orphan cleanup is bounded.
- Shared `components/homeowner-avatar.tsx` provides resilient photo/initials behavior.

## Homeowner Premium UI System

Homeowner portal UX is phone-first, compact, and task-oriented.

- Prefer icon-led rows, tabs, chips, compact summaries, and disclosures over large decorative card grids.
- Do not repeat headings/status explanations that are already visible.
- Reuse `components/portal-mobile-shell.tsx` patterns before creating one-off mobile containers.
- Keep Payment, Requests, Community, Messaging, and Profile viewport-safe and touch-safe.
- Payment keeps current balance and primary Pay action dominant; required PayMongo/fee guidance remains accessible but may be collapsed.
- Fixed homeowner bottom navigation preserves safe-area padding, keyboard focus, and approximately 48px+ destination touch targets.

## Homeowner Statement of Account UI and Print Contract

`/portal/soa` screen and print output are separate presentation surfaces over the same authenticated, tenant-scoped SOA payload.

- Screen keeps `Net account balance` dominant and uses collapsible Receivables Aging, Running Ledger, Payment History, and Billing History.
- Narrow-screen history uses stacked mobile rows/cards rather than horizontal tables.
- `Print SOA` uses `components/homeowner/payments/homeowner-soa-print-document.tsx`; print completeness must not depend on disclosure open/closed state.
- Print includes association identity, homeowner/account/property details, balances, full aging/ledger/payment/billing history, receipt/payment references, and signature area.
- Do not add an admin-only verification URL QR to the homeowner print surface.
- Regression: `tests/unit/homeowner-soa-premium-surface.test.ts` and `tests/unit/homeowner-soa-complete-print.test.ts`.

## Homeowner Payment Status Authority

Current financial state is derived from authoritative posted ledger/SOA evidence, not an older failed attempt.

- If billing exists and current outstanding balance is `<= 0`, current status is Fully Paid even if an earlier payment request was rejected/cancelled.
- Historical rejected/cancelled attempts remain audit history but do not override settled current status.
- PayMongo posting occurs only from verified gateway processing and the normal transactional ledger/receipt path.
- Linked posted `Payment`/`Collection` evidence is stronger than stale request metadata and should render Paid/confirmed status.
- Browser redirects/query parameters cannot create receipts or financial postings.

# Active Initiative: Complaint-to-Grievance Foundation — BRD v1.0

Approved baseline: `docs/complaints/HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`.

Current status/evidence:

- `docs/complaints/GRIEVANCE_PHASE1_IMPLEMENTATION_STATUS.md`
- `docs/complaints/GRIEVANCE_PHASE1_TRACEABILITY.md`
- `docs/complaints/HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0_RELEASE_RECORD.md`
- PR #122 — `feat: grievance foundation phase 1` — MERGED

The architecture rule is mandatory: **Complaint remains the intake/operational case layer; formal grievance/compliance remains a separate domain.** Do not expand `ComplaintStatus` into a monolithic notice/mediation/hearing/board/appeal state machine.

## Grievance Initiative Status

| Stage | Status | Release evidence |
| --- | --- | --- |
| Business recommendation | COMPLETE | Approved 2026-08-17 |
| BRD v1.0 | COMPLETE | Approved requirements baseline; business scope unchanged |
| Technical design | COMPLETE FOR PHASE 1 | Additive separate grievance domain; REST anonymous messaging; server-authoritative tenant/permission gates |
| Schema/API design | COMPLETE | Prisma desired state, additive migration chain, anonymous APIs, SUB/VER/GRV/COM/DDL services and UI implemented |
| Implementation | COMPLETE FOR PHASE 1 | Review remediations implemented; all PR #122 inline review threads resolved before merge |
| Automated validation | COMPLETE | Exact merged-main SHA `e34bf48a8519cf6a8389a78f998bbfafd46653c0` passed HOAHub MySQL CI #718 (`32037027056`) end-to-end |
| PR/merge | COMPLETE | PR #122 merged to `main` as `e34bf48a8519cf6a8389a78f998bbfafd46653c0` |
| Hostinger deployment | DEPLOYED / VERIFIED | Production `/release.txt` matched `e34bf48a8519`; public `/api/health` passed |
| Production UAT | AUTOMATED RELEASE UAT PASS | Exact main build passed unit/integration/critical/browser gates plus live release-marker and health verification; a separate authenticated live-tenant business sign-off session was not executed by the deployment workflow |

## Phase 1 Requirement Groups

- **ANM** — anonymous two-way text messaging using REST polling and short-lived anonymous complaint sessions.
- **SUB** — structured complaint subject/property/vehicle/common-area/unknown targets while preserving free-text incident location.
- **VER** — policy-driven independent verification and server-enforced gate before configured formal/enforcement action.
- **GRV** — minimal separate `GrievanceCase` foundation linked to a complaint.
- **COM** — tenant-scoped Grievance Committee business appointments and scoped permissions.
- **DDL** — formal/process deadlines separated from complaint operational SLA.
- **SEC-GRV / UX-GRV / NFR-GRV** — tenant isolation, privacy, auditability, mobile/PWA, compatibility, validation, rollback, and deployment controls.

The detailed requirement IDs and acceptance criteria in the BRD remain authoritative.

## Grievance Implementation Evidence

Primary implementation includes:

- Prisma desired state: `prisma/schema.prisma`, `prisma/grievance-foundation.prisma`.
- Additive migration chain beginning with `prisma/migrations/20260817093000_grievance_foundation_phase1/migration.sql` plus reviewed follow-up referential-integrity migration(s).
- Anonymous privacy/session: `lib/services/complaint-anonymous-session.ts`, `lib/anonymous-request-security.ts`, anonymous session/message API routes.
- Grievance domain: `lib/services/grievance-foundation.ts`, `lib/services/grievance-admin.ts`, `lib/services/grievance-authorization.ts`, `lib/services/grievance-feature.ts`, `lib/services/grievance-reporting.ts`, `lib/services/grievance-sla.ts`.
- Server actions: `lib/actions/grievance.ts`, `lib/actions/grievance-sla.ts`.
- Mobile/PWA tracker: `components/complaint-track-form.tsx`, `app/complaints/track/page.tsx`.
- Admin surfaces: grievance foundation/settings/SLA controls; complaint detail/queue/settings/grievance report pages.
- Regression suites: grievance Phase 1, admin, feature-switch, reporting, migration-safety, and review-remediation unit tests plus normal integration/critical/browser gates.

## Grievance Production Deployment Evidence

- Feature PR #122 merged to main SHA `e34bf48a8519cf6a8389a78f998bbfafd46653c0`.
- Main workflow #718 (`32037027056`) passed repository verification on that exact merge.
- Hostinger initially served the prior marker `f8becc4228d8`, then the connected-GitHub rollout published the expected `e34bf48a8519` marker.
- The managed deployment job passed public `/api/health` after the marker matched.
- This proves both repository validation and actual production publication; CI green alone is not treated as deployment evidence.
- The production-record docs-only change records this completed release and does not alter grievance runtime behavior.

## Anonymous Messaging Release Gates

- Tracking Code + PIN establishes/re-establishes a short-lived anonymous session; PIN is not resent on polling/posting.
- Raw token is HttpOnly browser state; only SHA-256 digest is stored.
- Anonymous session contains no resident `userId`, `homeownerId`, account number, email, IP/user-agent identity link.
- Every session lookup verifies the expected complaint public reference as well as token/expiry/revocation; this prevents a tab showing complaint A from silently polling/posting to complaint B after another tab replaces the cookie.
- Reuse `ComplaintMessage`; anonymous complainant messages have no resident identity FK.
- `senderType` is authoritative for complainant/staff/system classification, including after a staff account is deleted.
- Initial complaint messages are explicitly classified as complainant-originated rather than relying on staff-biased defaults.
- Anonymous APIs expose `PUBLIC` content only with safe labels and never expose internal/confidential notes, identities, emails, IDs, storage paths, or private timeline data.
- Forward and backward cursor pagination are bounded; older public history must remain accessible.
- Anonymous posting uses client idempotency; an uncertain retry keeps the same pending key until success or content change.
- Message insert plus required complaint activity/timeline/audit evidence is atomic.
- Message throttling is stable at tenant/complaint scope across short-lived session renewal; authentication and posting limits remain separate.
- State-changing anonymous requests enforce same-origin policy; responses are no-store; unexpected internal errors are generic externally.
- Follow-up attachments remain deferred.
- Tracker remains mobile/PWA safe with Back to Home, `100dvh`, safe areas, shrink-safe content, and text-only touch-safe composer.

## Complaint Subject and Verification Release Gates

- Subject property/person is different from incident location.
- `addComplaintSubject` revalidates homeowner/vehicle inside authenticated tenant scope.
- If both vehicle and homeowner IDs are supplied, the vehicle must belong to that homeowner/property.
- Vehicle-linked grievance subjects use reviewed referential integrity so hard deletion cannot leave a dangling structured subject.
- Verification is policy-driven; anonymity/named status is not proof strength.
- A policy may block enforcement only when that same policy requires verification.
- Verification status, activity, and audit evidence commit atomically.
- Verification and linked grievance state are serialized/locked so downgrade and Verified/Ready transitions cannot race into contradictory state.
- `IN_PROGRESS` records a start/non-completion event.
- A grievance cannot become `VERIFIED`, nor enter configured formal/enforcement-ready state, unless required independent verification is `PASSED`.
- `assertComplaintEnforcementAllowed` remains the reusable server gate for future punitive actions.
- Verification never automatically reveals confidential complainant identity.

## Grievance, Committee, Identity, and Deadline Release Gates

- Grievance promotion is explicit, tenant-scoped, and idempotent for creation history.
- `ComplaintCategory.requiresBoardReview` is policy metadata only; it is not evidence of a board vote/quorum/recusal/approval.
- Committee appointment grants only selected grievance permissions and never unrelated finance/platform authority.
- Platform roles are denied tenant grievance authority.
- Appointment target must already have a route-compatible complaint-admin or STAFF effective role; do not persist unusable HOMEOWNER/EMPLOYEE appointments while grievance routes require complaint-admin/STAFF access.
- UI/report/action authority uses active grievance permissions rather than administrator-only presentation checks.
- Confidential identity reveal is separately authorized. `REVEAL_CONFIDENTIAL_IDENTITY` does not derive from ordinary view/triage authority and must preserve the existing reason, confirmation, no-store, and audit controls.
- `GrievanceDeadline` remains separate from `Complaint.dueAt` operational SLA.
- Deadline creation plus activity/audit evidence is atomic.
- Paused process-deadline reason is retained in immutable history before active pause fields are cleared.
- Operational-SLA pause reason is likewise reconstructable after resume.
- Do not hard-code a universal 5-day, 7-day, or similar legal period.

## Deferred Grievance Scope

Unless the BRD is explicitly revised, Phase 2/3 retains:

- notice/proof-of-service;
- mediation and hearing scheduling/records;
- hearing witnesses/exhibits/minutes;
- evidence vault/provenance;
- board vote/quorum/abstention/recusal/formal decision;
- appeal/reconsideration;
- resolution agreement/e-signature;
- regulatory/adjudication dossier export;
- retention/legal-hold automation;
- advanced redaction/notifications; and
- real malware scanner integration.

## Grievance Validation Gate

Future grievance changes must preserve the same release gate on the exact candidate head:

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm exec prisma validate`
- `pnpm exec prisma generate`
- `pnpm exec prisma migrate deploy` against clean CI MySQL
- `pnpm db:seed`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:critical`
- `pnpm typecheck`
- `pnpm build`
- controlled Chromium preparation
- production smoke and critical browser/E2E tests

Do not merge a known failure merely to trigger deployment. Fix the defect or update a brittle source-contract test only when the changed assertion continues to protect the intended security/business invariant.

## Grievance Rollback

The grievance foundation is additive. Routine application rollback should ignore/disable new behavior while preserving grievance, verification, deadline, committee, anonymous-session, idempotency, activity, timeline, and audit history. Do not destructively drop those records in routine rollback.

# Hostinger Production Deployment Model

The authoritative production path is the Hostinger managed Node.js web application connected to GitHub `main`.

- Feature branches are not production deployment targets.
- Approved production changes land on `main` through GitHub.
- Push/merge to `main` runs HOAHub verification and triggers Hostinger connected-GitHub auto-deployment.
- Node.js production runtime is 22.x.
- `scripts/write-release-id.mjs` stamps the short Git revision into `public/release.txt` before build.
- Hostinger's install layer may use pnpm while the managed build subprocess may not expose pnpm in `PATH`; production build lifecycle commands must invoke Node scripts/package binaries directly rather than nested `pnpm` commands.
- Legacy PM2/SSH activation is not the authoritative managed-web-app deployment path.
- Never expose or print production `.env` contents.

## Production Release Identification

A release is deployed only when all of these are true:

1. the expected merged `main` commit passed the repository verification job;
2. Hostinger auto-deployment publishes that build;
3. production `/release.txt` equals the expected 12-character short `main` SHA; and
4. production `/api/health` succeeds.

The `deploy-production` job in `.github/workflows/ci-deploy.yml` performs the release-marker wait and public health check after a successful `main` verification run.

For the Complaint-to-Grievance initiative, the automated production release gate was completed for `e34bf48a8519cf6a8389a78f998bbfafd46653c0`: exact-main tests passed, Hostinger served `e34bf48a8519`, and public health passed. A separate authenticated tenant-representative sign-off may still be captured as an operational governance artifact when required; do not fabricate it.

## CI Browser Gate Recovery

- GitHub Actions uses repository-provided `@sparticuz/chromium` via `PUPPETEER_EXECUTABLE_PATH`.
- Browser isolation uses separate browser processes/default contexts where required; do not reintroduce unstable non-default context behavior without proof.
- Cleanup may force-kill only failed browser processes and must not relax business assertion timeouts.
- Retry remains limited to explicitly recognized transient browser-startup signatures, not business assertion failures.
- Regression: `tests/unit/browser-cleanup-policy.test.ts`.

## Change Discipline

For every repository change:

- read the implementation, tests, and relevant security boundaries first;
- keep tenant/user authority server-controlled;
- update or add regression tests when behavior changes;
- preserve homeowner mobile/PWA acceptance for user-facing changes;
- preserve the Hostinger managed deployment/release-marker model;
- update `Agent.md` and relevant BRD/status/traceability records before merge/deployment; and
- never report production deployment until release marker, health, and applicable production UAT are verified.
