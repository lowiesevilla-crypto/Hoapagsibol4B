# HOAHub Premium Admin UI V2 — Implementation & Traceability

Status: IMPLEMENTED — FINAL EXACT-HEAD GATES PENDING
Baseline main SHA: `a0965d49bab5c475a75864b4e8cea5594b5a9a00` (PR #127 merged)
Implementation branch: `feature/premium-admin-ui-v2`
Tracking issue: #128
Implementation PR: #130
Approved Canva design: `DAHSu6LXZUk` — HOAHub Premium Admin UI V2 — 42 Route Redesign

## Objective

Implement the approved premium Tenant Admin experience across the 42-route scope without weakening tenant isolation, RBAC, subscription entitlements, payment authority, payroll confidentiality, document workflows, complaint/grievance privacy, or AI governance.

## Non-negotiable UI contract

1. Compare the rendered current implementation to the approved Canva composition before changing each workspace.
2. Preserve authoritative production data and server-side actions. Never introduce mock KPI values or client-authoritative business state.
3. Use shared design primitives and one consistent PageHeader/workspace hierarchy rather than page-specific visual forks.
4. Search is a release blocker: every visible search control must be functional, tenant scoped, resettable, pagination-safe, keyboard/focus usable, and covered by regression tests.
5. Search coverage explicitly includes Admin command search; homeowner name/account/email/reference search where authorized; block, lot and combined inputs such as `block 1 lot 2`; billing/payment/document/reference searches; empty-result behavior; and no cross-tenant leakage.
6. Desktop tables that exceed a practical operational width retain safe horizontal table containment while the shared workspace shell prevents page-level overflow on tablet/mobile.
7. Essential actions must not clip or become unreachable on tablet/mobile widths.
8. Loading, empty, success, recoverable-error and permission-limited states are part of visual completion.
9. Production Gate Pass / Move In-Out templates are not recreated or replaced by this UI initiative.
10. `Agent.md` must be updated before the implementation PR can leave draft/merge.

## Implemented foundation

### Canonical PageHeader

The previous two visual implementations were consolidated. `components/page-header.tsx` is now the single renderer and supports both the legacy `action` compatibility prop and the premium `actions`/`context` contract. `components/ui/page-header.tsx` re-exports the canonical component. This removes the rounded decorative hero fork without requiring risky route-level business-logic rewrites.

### Shared Premium Admin workspace

`app/admin/layout.tsx` now applies `premium-admin-workspace` at the common Admin content boundary. `app/canva-parity.css` provides the approved Canva-derived surface hierarchy for cards, search/filter forms, tables, fields, pagination, alerts and responsive touch targets. Because the styling is attached to the authenticated Admin shell, all scoped routes inherit the same workspace treatment while preserving route-specific server actions and authorization.

### Permission/entitlement-filtered command search

The topbar command search no longer relies on the small hard-coded visual navigation subset for Tenant Admin users. The server layout builds a full command catalog from the authorized Admin route definitions and applies the same module, role, Document Management entitlement, AI use/manage permission and payroll-access filters used by the shell before serializing destinations to the client.

The command control supports:
- full authorized route labels, sections and path keywords;
- deduplication by destination;
- `Ctrl/Cmd + K` focus;
- Arrow Up/Down selection;
- Enter navigation;
- Escape dismissal;
- combobox/listbox ARIA state;
- clear no-match feedback.

No inaccessible route is intentionally added to the client command catalog.

### Homeowner Block/Lot search

`lib/homeowner-admin-search.ts` adds structured parsing for common property searches such as `block 1 lot 2`, `blk 1 lot 2`, and labeled block/lot forms while retaining residual name/email/account search terms. The page still composes this search predicate beneath the existing `tenantId` constraint, preserving tenant isolation. Unit regression coverage validates parser and query construction, and the critical browser suite now exercises a real seeded Block/Lot lookup and empty-result state.

### Logout/browser regression recovery

The inherited post-PR #127 logout browser regression was fixed by removing custom click interception and manual `HTMLFormElement.prototype.submit()` dispatch. Logout now uses the browser's unmodified native form submission path to the guarded POST endpoint; the server remains authoritative for session revocation and the HTTP 303 redirect. The static auth-navigation contract was updated to prevent reintroduction of client fetch, React action-state, manual submit or client redirect authority.

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

The visual-parity browser suite retains the dashboard/platform/homeowner baseline and expands Admin evidence across every implementation wave. Desktop captures now include Action Center, Settings, Onboarding, Homeowners, Billing, Payment Requests, Reports, Data Management, Document Operations, Document Repository, Complaints, Chat and Workforce. Tablet captures cover Homeowners, Payment Review and Documents; mobile captures cover Onboarding and Complaints. Every capture asserts no page-level horizontal overflow.

The approved design remains a visual and hierarchy reference. Production data values and workflow states remain authoritative and can intentionally differ from Canva sample values.

## Automated verification added or strengthened

- `tests/unit/premium-admin-ux-surface.test.ts` — shell, canonical PageHeader, command search keyboard contract and dashboard composition.
- `tests/unit/homeowner-admin-search.test.ts` — structured Block/Lot parsing and Prisma filter construction.
- `tests/e2e/admin-premium-search.mjs` — real Admin command navigation, combined Block/Lot lookup and empty-result behavior.
- `tests/e2e/auth-navigation-recovery.mjs` — existing cross-shell logout/Back regression remains a critical gate.
- `tests/e2e/ui-canva-visual-parity.mjs` — expanded desktop/tablet/mobile workspace evidence.
- `package.json` — Premium Admin search browser regression is included in `test:e2e`.

## Release gates

PR #130 must remain draft until the final branch head satisfies all of the following:
- lint;
- Prisma validation/generation/migration and seed;
- unit suite;
- database finance integration suite;
- critical verification suite;
- typecheck;
- production build;
- controlled Chromium production smoke and complete E2E suite, including Premium Admin search and auth navigation recovery;
- Canva Visual Parity workflow on the same exact head;
- current `Agent.md`.

Failures must be fixed at root cause and rerun. Tests, tenant scoping, RBAC, permission gates or release checks must not be weakened to produce green status.

After exact-head green: mark PR #130 ready, merge that verified head to `main`, allow the existing Hostinger managed production flow to publish the merge, then verify the expected `/release.txt`, `/api/health`, and authenticated production UI/search smoke checks. Only then may issue #128 be treated as production complete.
