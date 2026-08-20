# HOAHub Premium Admin UI V2 — Implementation & Traceability

Status: IMPLEMENTED — FINAL EXACT-HEAD VALIDATION REQUIRED BEFORE MERGE
Baseline main SHA: `a0965d49bab5c475a75864b4e8cea5594b5a9a00` (PR #127 merged)
Implementation branch: `feature/premium-admin-ui-v2`
Tracking issue: #128
Implementation PR: #130
Approved Canva design: `DAHSu6LXZUk` — HOAHub Premium Admin UI V2 — 42 Route Redesign

## Objective

Implement the approved premium Tenant Admin experience across the 42-route scope without weakening tenant isolation, RBAC, subscription entitlements, payment authority, payroll confidentiality, document workflows, complaint/grievance privacy, or AI governance.

## Non-negotiable UI contract

1. Compare rendered implementation to the approved Canva composition for scoped workspaces.
2. Preserve authoritative production data and server-side actions. Never introduce mock KPI values or client-authoritative business state.
3. Use shared design primitives and one consistent PageHeader/workspace hierarchy rather than page-specific visual forks.
4. Search is a release blocker: every visible search control must be functional, tenant scoped, resettable, pagination-safe, keyboard/focus usable, and covered by regression tests.
5. Search coverage includes Admin command search; authorized homeowner name/account/email/reference search; block, lot and combined inputs such as `block 1 lot 2`; billing/payment/document/reference searches; empty-result behavior; and no cross-tenant leakage.
6. Desktop tables that exceed practical operational width retain safe horizontal table containment while the shared workspace shell prevents page-level overflow on tablet/mobile.
7. Essential actions must remain reachable on tablet/mobile widths.
8. Loading, empty, success, recoverable-error and permission-limited states are part of visual completion.
9. Production Gate Pass / Move In-Out templates are not recreated or replaced by this UI initiative.
10. `Agent.md` and this traceability record must be current before PR #130 leaves draft or merges.

## Implemented foundation

### Canonical PageHeader

`components/page-header.tsx` is the single PageHeader renderer and supports the legacy `action` compatibility prop plus the premium `actions`/`context` contract. `components/ui/page-header.tsx` re-exports the canonical component.

### Shared Premium Admin workspace

`app/admin/layout.tsx` applies `premium-admin-workspace` at the common Admin content boundary. `app/canva-parity.css` provides the approved Canva-derived surface hierarchy for cards, search/filter forms, tables, fields, pagination, alerts and responsive touch targets. Route-specific server actions and authorization remain unchanged.

### Permission/entitlement-filtered command search

The server layout builds the Admin command catalog from authorized route definitions and applies role, enabled tenant modules, Document Management entitlement, AI use/manage permission, and payroll-access filters before serializing destinations to the client.

The command control supports full authorized route labels/sections/path terms, deduplication, `Ctrl/Cmd + K`, Arrow Up/Down, Enter, Escape, and combobox/listbox semantics. Inaccessible routes are not intentionally serialized for discoverability.

### Homeowner Block/Lot search

`lib/homeowner-admin-search.ts` parses searches such as `block 1 lot 2`, `blk 1 lot 2`, and labeled block/lot forms while retaining residual name/email/account terms. The resulting predicate remains beneath authenticated `tenantId` authority. Unit and critical browser coverage validate the parser, Prisma query construction, real seeded Block/Lot lookup, and empty-result behavior.

### Document request success handoff

Homeowner document request creation remains authoritative in `submitDocumentRequestAction`, including workflow, audit, and page revalidation. `lib/actions/document-request-submission.ts` wraps that action only to redirect successful submissions back to `/portal/documents` with presentation-only success/message query parameters. The form reads that server-controlled redirect state and renders an accessible `role="status"` confirmation. Errors remain in `useActionState`; the client does not optimistically claim success or race a local `router.refresh()` against server revalidation.

### Logout/browser regression recovery

The Premium Admin branch exposed an inherited logout race where a protected-page POST could be interpreted by Next.js as stale Server Action transport. The final architecture removes logout mutation submission from the protected React tree.

`components/auth-navigation-buttons.tsx` renders an ordinary same-origin anchor to `/api/auth/logout-transition?scope=current|all`. `GET /api/auth/logout-transition` returns a private/no-store raw HTML transition document outside React and accepts only trusted same-origin/configured navigation evidence. Its per-response nonce-scoped inline script performs a same-origin `DELETE /api/auth/logout` request with same-origin credentials, no-store semantics, explicit URL-encoded scope, and redirect following. The transition accepts only the server-returned same-origin login destination and then uses `window.location.replace()` solely to navigate to that server-authoritative destination.

`app/api/auth/logout/route.ts` keeps one shared `handleLogout` authority for both POST and DELETE. Both methods use the same server-side origin validation, session revocation, private/no-store response handling, and authoritative HTTP 303 login redirect. POST remains available for direct same-origin document clients; the isolated transition uses DELETE specifically so stale `Next-Action` POST metadata cannot divert the request into Next Server Action dispatch before the route handler runs.

This transport change does not weaken CSRF/same-origin policy, tenant isolation, RBAC, session authority, or redirect safety. The browser cannot choose tenant/session authority or invent a post-logout destination. GET-based session mutation remains prohibited.

`tests/e2e/auth-navigation-recovery.mjs` continues to exercise the real visible logout control for Tenant Admin, Platform Admin and Homeowner and requires final login navigation plus Browser Back protection. `verify:auth-navigation-cache`, `verify:homeowner-mobile-hardening`, and `verify:homeowner-pwa` must recognize this isolated transition/DELETE transport while continuing to enforce same-origin proof, no-store/CSP boundaries, server-side revocation, HTTP 303 authority, and the absence of protected-page client mutation authority.

## 42-route implementation scope

### Wave A — Foundation and parity audit
- shared Admin shell and command topbar
- canonical PageHeader
- shared premium workspace surfaces
- Admin command search
- responsive and visual-parity harness

### Wave B — Core administration and residents
- `/admin/dashboard`
- `/admin/settings`
- `/admin/settings/organization`
- `/admin/onboarding`
- `/admin/homeowners`
- `/admin/homeowners/new`
- `/admin/profile`
- `/admin/subscription`
- `/admin/agreement`
- `/admin/contractors`
- `/admin/vehicles`

### Wave C — Finance and payments
- `/admin/billing`
- `/admin/settings/billing-rules`
- `/admin/settings/billing-exemptions`
- `/admin/collections`
- `/admin/expenses`
- `/admin/payments/record`
- `/admin/payments/requests`
- `/admin/payments/active`
- `/admin/payments/history`
- `/admin/reports/dashboard`
- `/admin/reports`
- `/admin/data`
- `/admin/data/migrations`

### Wave D — Documents and repository
- `/admin/documents`
- `/admin/documents?section=types`
- `/admin/documents/operations`
- `/admin/documents?section=requests`
- `/admin/documents/new`
- `/admin/documents?section=issued`
- `/admin/document-management`
- `/admin/document-management/upload`
- `/admin/document-management/categories`

### Wave E — Complaints, AI, communications and workforce
- `/admin/complaints`
- `/admin/complaints/settings`
- `/admin/complaints/reports`
- `/admin/ai-copilot`
- `/admin/ai-assistance`
- `/admin/chat`
- `/admin/attendance`
- `/admin/payroll`

The original issue inventory contains 42 entries because `/admin/documents` appears both as a base workspace and as the duplicated inventory entry supplied during planning. The implementation treats the shared route once and separately covers its query-string sections.

## Canva parity coverage

The visual-parity browser suite retains the dashboard/platform/homeowner baseline and expands Admin evidence across every implementation wave. Desktop captures include Action Center, Settings, Onboarding, Homeowners, Billing, Payment Requests, Reports, Data Management, Document Operations, Document Repository, Complaints, Chat and Workforce. Tablet captures cover Homeowners, Payment Review and Documents; mobile captures cover Onboarding and Complaints. Every capture asserts no page-level horizontal overflow.

The approved design remains a visual/hierarchy reference. Production data values and workflow states remain authoritative and can intentionally differ from Canva sample values.

## Automated verification added or strengthened

- `tests/unit/premium-admin-ux-surface.test.ts` — shell, canonical PageHeader, command search keyboard contract and dashboard composition.
- `tests/unit/homeowner-admin-search.test.ts` — structured Block/Lot parsing and Prisma filter construction.
- `tests/unit/document-request-submission-feedback.test.ts` — authoritative document-request redirect handoff and accessible success feedback.
- `tests/e2e/admin-premium-search.mjs` — real Admin command navigation, combined Block/Lot lookup and empty-result behavior.
- `tests/e2e/auth-navigation-recovery.mjs` — real visible logout control, cross-shell logout, Browser Back security regression, and safe transition diagnostics.
- `tests/e2e/document-workflow.mjs` — homeowner document submission success plus server-rendered history visibility.
- `tests/e2e/ui-canva-visual-parity.mjs` — expanded desktop/tablet/mobile workspace evidence.
- `package.json` — Premium Admin search browser regression remains in `test:e2e`.

## Validation evidence and current gate

The implementation has repeatedly demonstrated green dependency integrity, lint, Prisma validation/generation/migration/seed, 297 unit tests, 30 integration tests, tenant/business verifiers, typecheck/build on the candidates that reached those stages, and Canva visual parity on the reviewed candidates.

The final static hardening failure on prior head `fccb2a075beb8bfe4872c3c26ecab62925dca6d0` was a verifier-contract mismatch: the runtime transition had moved to same-origin DELETE, while `verify:homeowner-mobile-hardening` still searched for `method: "POST"`. The verifier is corrected to require the actual DELETE transition plus shared POST/DELETE server authority, same-origin validation, private/no-store handling, and HTTP 303 redirect. This is a test-contract alignment, not a bypass of the security gate.

The exact final branch head created by the verifier/documentation alignment must still pass both HOAHub MySQL CI and HOAHub Canva Visual Parity before merge. A passing older head is not sufficient.

## Release gates

PR #130 must remain draft until the exact final branch head satisfies all applicable gates:
- lint;
- Prisma validation/generation/migration and seed;
- unit suite;
- database integration suite;
- all named critical/static verifiers;
- typecheck;
- production build;
- controlled Chromium production smoke and complete E2E suite, including Premium Admin search, document workflow, and auth navigation recovery;
- Canva Visual Parity on the same exact head;
- current `Agent.md` and this traceability record.

Failures must be fixed at root cause. Tests, tenant scoping, RBAC, permission gates or release checks must not be weakened to obtain green status.

After exact-head green, the user has already authorized marking PR #130 ready, merging the verified head to `main`, and proceeding through the existing Hostinger managed production flow without another approval prompt. Production completion requires the merged `main` verification/deploy workflow to pass, the expected short merge SHA to be served at `/release.txt`, and `/api/health` to succeed. Applicable authenticated production UI/search smoke should be performed when an authorized production session is available; no live authenticated sign-off may be fabricated when such access is unavailable.

Rollback is application-level: revert the PR #130 merge if necessary while preserving business data.