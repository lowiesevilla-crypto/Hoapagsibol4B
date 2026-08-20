# HOAHub Agent Context

Last updated: 2026-08-20

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

## Authentication Navigation Recovery Hotfix — PR #127

PR #127 (`fix/auth-navigation-recovery`) permanently hardens logout, browser Back/Forward restoration, and global error recovery across Tenant Admin, Platform Admin, Homeowner/PWA, and Employee protected surfaces.

### Auth Navigation Architecture

- Shared logout uses same-origin `POST /api/auth/logout` with server-side session revocation, verified-login-choice cleanup, private/no-store responses, and the server-authoritative login destination.
- `components/auth-navigation-buttons.tsx` uses an ordinary HTML form POST and leaves the browser's native submit/default navigation path unmodified. Do not intercept logout with client `fetch`, React Server Action state, manual `HTMLFormElement.submit()`/`requestSubmit()`, or client-side redirect authority; the guarded server endpoint revokes the session and returns the authoritative HTTP 303 destination.
- Protected-route recovery listens to browser `pageshow` and `popstate` restoration for `/admin`, `/platform`, `/portal`, and `/employee`. A restored protected document is reloaded so current server session/RBAC authority is re-established instead of trusting stale browser/React history state.
- `app/error.tsx` uses a hard-document retry for non-chunk failures. If the same route fails again immediately, recovery falls back through `/` so the server selects a safe authenticated or login entry point rather than repeatedly resetting the same broken tree.
- Login/auth/private responses remain no-store. Same-origin/CSRF protections remain mandatory on logout. Tenant identity, role, and redirect authority remain server controlled.
- Legacy navigation Server Actions in `lib/actions/auth.ts` are not wired into the shared logout control; do not reintroduce the prior logout race through `useActionState` or another client-effect redirect pattern.

### Permanent Regression Contract

- `tests/e2e/auth-navigation-recovery.mjs` signs in as Tenant Admin, Platform Admin, and Homeowner, exercises authenticated history navigation, logs out, then verifies Browser Back cannot revive an interactive protected document or global error state.
- Unit/source contracts cover protected-route recovery, repeated-error fallback, same-origin logout behavior, and the requirement that the shared logout component not depend on the retired navigation Server Actions.
- `verify:auth-navigation-cache` is part of `test:critical`; the normal MySQL CI production smoke/browser stage runs the real Chromium regression.
- No Prisma schema/migration, finance authority, payroll confidentiality, complaint/grievance privacy, document/template workflow, AI governance, tenant isolation, or RBAC scope is changed by this hotfix.

### Release State — 2026-08-20

- PR #127 is merged; Premium Admin V2 started from the resulting `main` baseline `a0965d49bab5c475a75864b4e8cea5594b5a9a00`.
- The Premium Admin branch discovered a browser regression in the inherited logout implementation: CI could click the visible logout control yet remain on `/admin/dashboard`. The follow-up fix removes manual submit interception and restores the browser-native form path while retaining server same-origin/configured-origin validation and the HTTP 303 authority.
- `tests/e2e/auth-navigation-recovery.mjs` remains the release gate for this follow-up; the regression must be green on the exact Premium Admin candidate before that candidate merges.
- Rollback remains application-level. No destructive data rollback is required for the auth-navigation changes because there is no database schema migration.

# Active Initiative: Premium Admin UI V2 — PR #130

Approved Canva design: `DAHSu6LXZUk` — HOAHub Premium Admin UI V2 — 42 Route Redesign.
Tracking issue: #128.
Implementation branch: `feature/premium-admin-ui-v2`.
Implementation/traceability record: `docs/ui/HOAHUB_PREMIUM_ADMIN_UI_V2_IMPLEMENTATION.md`.

## Premium Admin V2 Architecture

- The Admin UI preserves the existing authenticated server layout as the tenant/RBAC/module/entitlement authority. Visual redesign must not make the browser authoritative for tenant, role, module, payroll, AI, document, finance, complaint, or workflow decisions.
- `components/page-header.tsx` is the canonical workspace PageHeader and accepts the legacy `action` alias plus premium `actions` and `context`. `components/ui/page-header.tsx` re-exports it; do not create another competing PageHeader visual implementation.
- `app/admin/layout.tsx` applies `premium-admin-workspace` at the common content boundary. `app/canva-parity.css` owns shared premium card, table, field, filter, pagination and responsive surface treatment so the 42-route scope can be aligned without rewriting each route's business actions.
- The Admin command catalog is built server-side from the full authorized route definitions, then filtered by role, enabled tenant modules, Document Management entitlement, AI use/manage permission, and payroll access before it is passed to `ShellCommandSearch`.
- `ShellCommandSearch` supports authorized route/section/path terms, deduplication, `Ctrl/Cmd + K`, Arrow Up/Down, Enter, Escape and combobox/listbox semantics. Never add an inaccessible route to the serialized command catalog merely for discoverability.
- Homeowner directory search remains under authenticated `user.tenantId`. `lib/homeowner-admin-search.ts` parses explicit Block/Lot phrases such as `block 1 lot 2` into property constraints while retaining residual name/email/account search terms.
- Mock data from Canva is never production data. Existing Prisma records, server actions, finance ledgers, document state, complaint/grievance controls, payroll confidentiality and AI governance remain authoritative.
- Production Gate Pass / Move In-Out templates and official document output are not recreated or replaced by this UI initiative.
- No Prisma schema migration is introduced by Premium Admin V2.

## Premium Admin V2 Scope and Responsive Contract

- The tracked 42-route inventory spans Settings/Account, Dashboard/Onboarding/Residents, Finance/Payments/Reports/Data, Document Operations/Repository, Complaints, AI, Chat, Attendance and Payroll. `/admin/documents` is intentionally represented both as the base workspace and through its query-string sections in the original inventory.
- All scoped routes inherit the shared premium workspace boundary and canonical PageHeader presentation while retaining route-specific data/actions.
- Tables remain contained within their operational scroll surface instead of causing page-level horizontal overflow.
- Essential Admin actions must remain reachable at desktop/tablet/mobile widths; touch targets are at least 44px in the shared Admin mobile treatment where the component does not already provide a larger target.
- Visual-parity evidence is expanded across every implementation wave: desktop captures cover Settings, Onboarding, Homeowners, Action Center, Billing, Payment Requests, Reports, Data, Documents, Document Repository, Complaints, Chat and Workforce; tablet captures cover Homeowners, Payment Review and Documents; mobile captures cover Onboarding and Complaints.

## Premium Admin V2 Search Release Gate

- Search is a release blocker, not decorative UI.
- `tests/unit/homeowner-admin-search.test.ts` covers structured Block/Lot parsing and generated Prisma conditions.
- `tests/e2e/admin-premium-search.mjs` logs in with the seeded Admin, uses keyboard command search to navigate to Homeowners, performs a real combined Block/Lot lookup against a seeded tenant homeowner, and verifies the empty-result state.
- The Premium Admin browser search regression is included in `test:e2e`; do not remove it to obtain green CI.
- Existing route-level search controls remain server/tenant scoped and must preserve reset/pagination semantics.

## Premium Admin V2 Release State — 2026-08-20

- PR #130 remains draft until the exact head passes both HOAHub MySQL CI and HOAHub Canva Visual Parity.
- A previous candidate passed lint, Prisma validation/generation/migration/seed, unit, finance integration, critical verification, typecheck and production build but failed the final browser suite on logout navigation. That root cause was corrected rather than bypassed.
- Pre-Agent candidate `1ce6a48e0dc6c0e636e315ea7522f8af426a05f1` includes the canonical PageHeader, authorized full-route command search, Block/Lot parser and browser regression, shared Premium Admin workspace treatment, expanded visual-parity capture and implementation documentation.
- This `Agent.md` update changes the exact candidate head again. Therefore PR #130 must not leave draft or merge until the new exact documented head is green in both required workflows.
- After exact-head green, the user has explicitly authorized marking PR #130 ready, merging the verified head to `main`, and proceeding through the existing Hostinger managed deployment without another approval prompt.
- Production completion requires the merged `main` verification/deploy workflow to pass, Hostinger to serve the expected 12-character merge SHA at `/release.txt`, `/api/health` to succeed, and the applicable production UI/search smoke evidence to pass.
- Rollback is application-level: revert the PR #130 merge if necessary. Preserve all business data; there is no Premium Admin V2 schema rollback.

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

# Active Initiative: Community Intelligence UI System — Phase 3

Approved design baseline: `docs/ui/HOAHUB_COMMUNITY_INTELLIGENCE_UI_SYSTEM_V1.md`.

Implementation branch / PR: `feature/ui-system-foundation` / PR #123, followed by Canva visual-parity remediation PR #125 and content-aside scope hotfix PR #126.

## Phase 3 Implementation State

| Wave | Status | Primary implementation |
| --- | --- | --- |
| Wave 1 — Design foundation | COMPLETE | semantic Tailwind tokens; shared `PageHeader`, `MetricCard`, `StatusBadge`, `WorkspaceCard`; design-system contract |
| Wave 2 — Shell separation | COMPLETE | Platform topbar/control-plane identity, platform navigation taxonomy, `/platform/dashboard`, tenant/platform visual separation |
| Wave 3 — Tenant core | COMPLETE | Tenant Dashboard V2, permission-aware `/admin/actions`, tenant-scoped Resident 360 overview |
| Wave 4 — Tenant operational workspaces | COMPLETE | shared premium PageHeader/status layer applied across existing Finance/Documents/Workforce/AI workflows; protected `/admin/workforce` HRIS/Payroll command center |
| Wave 5 — Platform ecosystem | COMPLETE | Tenant List V2, simplified Tenant 360 tabs, Platform AI Usage metadata workspace, real Platform Audit & Security evidence workspace; existing Subscriptions/Plans/Invoices/Agreements/Licenses/Document Usage retain authoritative actions with premium shared presentation |
| Wave 6 — Homeowner/PWA | COMPLETE | shared premium portal mobile header/bottom navigation/cards; existing Home/Payments/Requests/Community/More routing, payment/document workflows, AI governance and safe-area behavior preserved |
| Exact-head automated validation | COMPLETE FOR PR #125 | remediation head `f6f07f23e95912047dec36daba88c91d5d2da825` passed HOAHub MySQL CI #762 and Canva Visual Parity #13 |
| Merge to `main` | COMPLETE FOR PR #125 | PR #125 merged to `main` as `cb279581ddff60070db31d3b08a475778e38ec52` on 2026-08-18 |
| Content-aside scope hotfix | VALIDATED / PENDING FINAL EXACT-HEAD RERUN | pre-Agent head `5dd5fab7fb4c3b029bb36cbc7039a6ff2ac87a33` passed HOAHub MySQL CI #765 and Canva Visual Parity #14; PR #126 remains draft until this Agent record is included in a new exact-head validation |
| Hostinger production deployment | AUTHORIZED / PENDING HOTFIX MERGE | deploy PR #126 only after final exact-head CI and visual parity pass; verify `/release.txt` and `/api/health` before reporting complete |

## Phase 3 Architecture and Safety Contract

- Existing `pine`, `leaf`, `ink`, `sand`, `.card`, `.field`, `.btn-*`, `.table-wrap`, and `.data-table` remain supported; no parallel design framework was introduced.
- Platform control-plane identity must use HOAHub branding (`/Hoahub-logo.png`), never a customer/tenant logo.
- `/admin/actions` is an aggregator only. It checks the authenticated user permissions and links into authoritative Payment, Billing, Document, Payroll, and Complaint workflows; it does not add a cross-module approval bypass.
- Resident 360 is tenant-scoped by authenticated `user.tenantId`; it adds account/payment/document/vehicle/household summaries and links back to the existing homeowner profile/access and SOA workflows. It does not expose confidential complaint identity data.
- `/admin/workforce` uses `requirePayrollAccess()` and tenant-scoped workforce/payroll queries. Salary/payroll authority is not widened.
- `/platform/ai-usage` reads `AiUsageLedger` metadata only (request/outcome/tokens/cost/latency/tenant identity); it must not expose prompt/response content.
- `/platform/audit` is a read-only view over the existing `AuditLog`; it does not fabricate audit/security events or mutate evidence.
- Platform Tenant List V2 and Tenant 360 navigation retain existing subscription, billing, user, feature, advisory/settings and audit actions.
- `components/portal-mobile-shell.tsx` keeps safe-area padding, touch-size behavior and the existing Home/Payments/Requests/Community/More information architecture.
- Official document output/print CSS and production Gate Pass / Move In-Out templates are not recreated or replaced by this UI initiative.
- No Prisma schema migration is part of this UI initiative.
- Complaint/grievance privacy, verification, committee/identity, deadline and reporting controls remain unchanged.

## Phase 3 Validation and Regression

Primary regression contracts:

- `tests/unit/ui-system-foundation.test.ts`
- `tests/unit/community-intelligence-ecosystem.test.ts`
- `tests/unit/canva-aside-scope.test.ts`
- `tests/e2e/ui-aside-scope-regression.mjs`
- normal homeowner mobile/PWA critical suites
- normal payroll, document, complaint/grievance, finance, RBAC and browser suites through HOAHub MySQL CI

Validation history for this release candidate:

- Earlier foundation head `e43f18d529d8d9a8bf90a6481b2bcfd827f79c4b` passed HOAHub MySQL CI #721 end-to-end before Waves 3–6 were added.
- Full-ecosystem CI #742 stopped at lint because `app/admin/actions/page.tsx` had one unused `MessageSquareWarning` import; the import was removed.
- Static Prisma review corrected the Workforce Hub to use the actual `PayrollPeriod.startDate/endDate/payDate` fields and normalized AI usage group ordering.
- Full-ecosystem CI #746 then passed dependency integrity, lint, Prisma validation/generation/migration, database seed, unit tests, finance integration, and the critical verification suite, but TypeScript typecheck caught a narrow-array `AttendanceStatus` inference in the Workforce present-count calculation. The calculation now uses a typed `Set<AttendanceStatus>` so all enum values are accepted safely.
- Final remediation head `f6f07f23e95912047dec36daba88c91d5d2da825` passed HOAHub MySQL CI #762 end-to-end and HOAHub Canva Visual Parity #13, including production build, controlled Chromium, production smoke/critical browser tests, and 12-screen actual-render capture.
- Content-aside hotfix pre-Agent head `5dd5fab7fb4c3b029bb36cbc7039a6ff2ac87a33` passed HOAHub MySQL CI #765 end-to-end and Canva Visual Parity #14. The visual workflow additionally asserted and captured `/admin/ai-copilot` and `/admin/ai-assistance`, while retaining the Platform and Homeowner comparison screens.

Before any future Phase 3 production change, the exact candidate head must pass dependency install, lint, Prisma validation/generation/migration on CI MySQL, seed, unit tests, integration tests, critical verification, typecheck, production build, controlled Chromium preparation, and production smoke/critical browser suites.

Rollback remains application-level: revert the UI release while preserving all existing business data and schema. No destructive data rollback is required for Phase 3 because no new database migration is introduced.

## Phase 3 Canva Visual Parity Remediation — 2026-08-18

The first Phase 3 production implementation preserved business logic but materially drifted from the user-approved Canva visual specifications. PR #125 (`fix/ui-canva-visual-parity`) is the corrective visual-parity release.

### Approved Canva Sources of Truth

- `DAHSjdJ1uyU` — HOAHub Premium UI Mockups — Tenant + Platform: Tenant Dashboard, Platform Command Center, Tenant 360.
- `DAHSjeTUc_E` — HOAHub Premium UI Mockups — Operational Suite: Action Center, Resident 360, Billing & Payments, Documents, HRIS/Payroll, AI Staff Copilot.
- `DAHSjYfpLyE` — HOAHub Premium UI — Remaining Platform + PWA Screens: Platform Tenant List, Subscription & Billing, Plans & Modules, Platform Audit & Security, Homeowner PWA Dashboard, Payment Center, Homeowner Documents, Mobile Action Center.
- `DAHSjqtAxf4` — HOAHub Phase 3 — Community Intelligence OS Design System.

### Visual Parity Contract

- The Canva mockups are the visual source of truth; existing production workflows remain the business source of truth.
- Central approved palette: navy `#071f31`, navy2 `#0b2e46`, pine `#0d4f46`, technology blue `#0b95d8`, blue2 `#27b6ff`, community green `#6ed64b`, neutral canvas `#f3f8fb`.
- Desktop Tenant, Platform, and homeowner shells use an approximately 300px navigation rail at large breakpoints.
- Tenant UI uses a restrained navy/teal rail, neutral canvas, white executive cards, controlled technology-blue interactions, and green primarily for positive/community state.
- Platform UI must be visually distinct and dark: HOAHub platform identity, dark control-plane topbar/hero, SaaS portfolio hierarchy, and real commercial/governance signals.
- KPI cards must use restrained executive surfaces; the rejected colored vertical side-strip treatment must not return.
- Homeowner/PWA uses a blue/teal gradient mobile header, compact Account Health hierarchy, compact Resident Shortcuts, floating white bottom navigation, safe areas, and approximately 48px+ touch targets.
- Functional mockup controls must connect to existing routes/actions. Tenant Quick Create links to real payment/homeowner/document workflows; navigation search is route navigation, not fake global data search.
- Mockup-only sample data must never be copied into production. No fabricated MRR, uptime, revenue, health score, AI answer, integration state, or placeholder KPI may be presented as real.
- Deterministic insight cards may summarize authoritative records (for example posted collection momentum, subscription state, receivables, tenant status) but must not imply an AI/model inference when no model evaluation occurred.

### Remediation Implementation and Safety

- `app/canva-parity.css` centralizes the approved visual palette and shell treatment.
- Shared `PageHeader`, `MetricCard`, and `WorkspaceCard` presentation is corrected to the approved visual language.
- Tenant Dashboard uses real billing/payment/collection/outflow/receivable/action data in the Canva composition.
- Platform Command Center uses real tenant/subscription/invoice-risk records; no fake MRR/uptime is introduced.
- Tenant 360 uses real tenant/user/module/payment-routing/audit data while preserving existing platform fee, branding, advisory, module, subscription, and settings actions below the overview.
- Homeowner dashboard keeps Statement of Account as the financial source of truth and preserves existing Pay, Documents, Complaints, Community, and PWA navigation/entitlement boundaries.
- No Prisma schema or migration is part of this remediation.
- No auth, RBAC, tenant-isolation, payroll confidentiality, complaint/grievance privacy, payment authority, document generation, or official production template workflow is widened or replaced.

### Testing and Visual Comparison Gate

- `tests/unit/ui-canva-visual-parity.test.ts` locks the approved palette, shell geometry, flagship compositions, real-data-only rule, and absence of rejected KPI strips.
- Existing presentation-only tests were updated only where they encoded the rejected visual implementation; security/business assertions remain in place.
- `scripts/verify-homeowner-mobile-dashboard.ts` continues to enforce authenticated/tenant-scoped SOA data, entitlements, no browser-supplied authority, ≥48px touch safety, PWA/cache boundaries, and approved Canva Account Health/Resident Shortcuts presentation.
- `.github/workflows/ui-canva-parity.yml` builds the exact PR head with CI MySQL and controlled Chromium, captures actual browser screenshots, and uploads `hoahub-canva-visual-parity` for comparison.
- Browser evidence covers Tenant Dashboard, Action Center, Billing, Documents, Workforce, Platform Command Center, Tenant 360, Platform Tenant List, Platform Audit & Security, Homeowner PWA Dashboard, Payment Center, Homeowner Documents, Admin AI Staff Copilot, and Admin AI Assistance governance.
- Exact-head browser regression on `182586bff4acd3d4e0c4a03bbeeafea05ed8a6da` was presentation-only: `tests/e2e/ai-assistant.mjs` still expected retired homeowner labels `Current Balance` and `Pay Now` after a simulated provider outage even though the redesigned dashboard correctly rendered `Account Health` and `Pay Dues`. The E2E assertion was updated to the approved Canva labels while preserving provider-outage isolation, AI governance, tenant isolation, quota, and floating-assistant checks.
- Final release head `f6f07f23e95912047dec36daba88c91d5d2da825` passed HOAHub MySQL CI #762 and Canva Visual Parity #13 on the same source state before merge.

### Current Remediation State

- PR #125: **MERGED** to `main` as `cb279581ddff60070db31d3b08a475778e38ec52`.
- User requirement: actual implementation must be tested and visually compared to Canva before production — **SATISFIED on final remediation head**.
- User authorization on 2026-08-18: proceed to production deployment automatically once the exact candidate passes all required gates — **AUTHORIZED**.
- Approval state: **AUTOMATED RELEASE GATES PASSED / MERGED**.
- Production state for PR #125: superseded by the content-aside hotfix release candidate; do not report the corrected ecosystem complete until PR #126 is verified live.

## Canva Shell Content-Aside Scope Hotfix — 2026-08-18

Authenticated production screenshots of `/admin/ai-copilot` and `/admin/ai-assistance` exposed a shared CSS scoping defect after the Canva parity release: page-level `<aside>` content surfaces inherited the navigation sidebar's dark gradient, border/shadow, and forced 300px desktop width. The same broad selector created risk for Platform and Homeowner screens containing nested `<aside>` elements.

- Root cause: `app/canva-parity.css` used `.canva-tenant-shell aside`, `.canva-platform-shell aside`, and `.canva-portal-shell aside` descendant selectors for navigation-sidebar styling.
- The actual shared `Sidebar` root carries the literal Tailwind class `lg:fixed`. PR #126 therefore scopes gradient, link/nav styling, accent strip, shadow, and desktop width rules to `aside.lg\\:fixed` only.
- Page-level `<aside>` elements retain their component-owned light/dark surfaces and layout dimensions.
- `tests/unit/canva-aside-scope.test.ts` rejects future broad shell-aside selectors and guards the forced-width rule.
- `tests/e2e/ui-aside-scope-regression.mjs` logs into the admin shell, checks the real sidebar remains approximately 300px with its Canva gradient, verifies content asides on both affected AI routes are not forced to 300px or given the navigation gradient, checks horizontal overflow, and saves screenshots.
- Canva Visual Parity now includes screenshots `13-admin-ai-copilot-aside-scope.png` and `14-admin-ai-assistance-aside-scope.png` in addition to the existing Tenant, Platform, and Homeowner renders.
- Manual screenshot comparison on the pre-Agent hotfix head confirms the AI content panels are restored to light content surfaces; Platform retains the dark control plane; Homeowner PWA, Payment Center, and Documents retain their approved visual treatment.
- Pre-Agent hotfix head `5dd5fab7fb4c3b029bb36cbc7039a6ff2ac87a33` passed HOAHub MySQL CI #765 and Canva Visual Parity #14. Because this `Agent.md` update changes the head, the new exact head must pass both workflows again before merge.
- No Prisma schema, auth, RBAC, tenant isolation, payroll confidentiality, complaint/grievance privacy, payment authority, document generation/template, AI governance, or tenant-data behavior is changed by this hotfix.
- PR #126 remains **DRAFT / NOT MERGED / NOT DEPLOYED** until the exact documented head is green. User authorization to merge and deploy automatically after green exact-head CI + visual parity remains in force.

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

For the Canva visual-parity remediation, the code release was validated on head `f6f07f23e95912047dec36daba88c91d5d2da825` and merged to main as `cb279581ddff60070db31d3b08a475778e38ec52`. Production completion must be recorded only after Hostinger serves the expected current `main` short SHA and `/api/health` passes.

For the Canva content-aside scope hotfix, PR #126 is authorized for automatic merge/deploy only after the exact documented head passes both HOAHub MySQL CI and Canva Visual Parity. Production completion requires the merged main short SHA from that release to be served at `/release.txt` and `/api/health` to pass.

For the authentication navigation recovery hotfix, PR #127 is merged and is the baseline for Premium Admin V2. Any follow-up auth-navigation correction in PR #130 remains subject to the same real-browser regression and production release-marker/health gates.

For Premium Admin V2, PR #130 is authorized for automatic ready/merge/deploy only after its exact head passes HOAHub MySQL CI and Canva Visual Parity. Production completion requires the merged `main` short SHA at `/release.txt`, successful `/api/health`, a green main `deploy-production` job, and applicable authenticated UI/search smoke evidence.

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
