# HOAHub Premium Admin UI V2 — Implementation & Traceability

Status: IN PROGRESS
Baseline main SHA: `a0965d49bab5c475a75864b4e8cea5594b5a9a00` (PR #127 merged)
Implementation branch: `feature/premium-admin-ui-v2`
Tracking issue: #128
Approved Canva design: `DAHSu6LXZUk` — HOAHub Premium Admin UI V2 — 42 Route Redesign

## Objective

Implement the approved premium Tenant Admin experience across the 42-route scope without weakening tenant isolation, RBAC, subscription entitlements, payment authority, payroll confidentiality, document workflows, complaint/grievance privacy, or AI governance.

## Non-negotiable UI contract

1. Compare the rendered current implementation to the approved Canva composition before changing each workspace.
2. Preserve authoritative production data and server-side actions. Never introduce mock KPI values or client-authoritative business state.
3. Use shared design primitives and one consistent PageHeader/workspace hierarchy rather than page-specific visual forks.
4. Search is a release blocker: every visible search control must be functional, tenant scoped, resettable, pagination-safe, keyboard/focus usable, and covered by regression tests.
5. Search coverage explicitly includes Admin command search; homeowner name/account/email/reference search where authorized; block, lot and combined inputs such as `block 1 lot 2`; billing/payment/document/reference searches; empty-result behavior; and no cross-tenant leakage.
6. Desktop tables that exceed a practical operational width should degrade to task-oriented responsive cards/drawers on smaller screens while preserving audit/detail access.
7. Essential actions must not clip or become unreachable on tablet/mobile widths.
8. Loading, empty, success, recoverable-error and permission-limited states are part of visual completion.
9. Production Gate Pass / Move In-Out templates are not recreated or replaced by this UI initiative.
10. `Agent.md` must be updated before the implementation PR can leave draft/merge.

## Implementation waves

### Wave A — Foundation and parity audit
- Inventory all scoped routes and existing shared components.
- Consolidate legacy/new PageHeader usage into one compatible premium contract.
- Standardize workspace primitives for KPIs, filters, data lists, drawers, action queues, steppers and form sections.
- Extend visual-parity screenshot coverage for representative admin routes.
- Verify shared Admin command search end to end.

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
- `/admin/documents` and sections `types`, `requests`, `issued`
- `/admin/documents/operations`
- `/admin/documents/new`
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

## Verification gates

For each wave:
- Render desktop and mobile/tablet screenshots and compare with approved Canva hierarchy and tokens.
- Record intentional deviations required by real product data/workflow constraints.
- Add/update unit/source contracts for shared components and search behavior.
- Add/update browser/E2E coverage for search, critical actions and viewport behavior.
- Run lint, typecheck, unit/integration/critical verification, production build and Canva Visual Parity.
- Fix root causes and rerun failed gates; do not weaken tests to obtain green.

Final release requires exact-head green CI, exact-head visual parity, current `Agent.md`, merge to `main`, Hostinger managed deployment, expected `/release.txt`, successful `/api/health`, and authenticated production UI/search smoke/UAT.

## Kickoff state

PR #127 is merged and `main` points to `a0965d49bab5c475a75864b4e8cea5594b5a9a00`. Development has started from that exact baseline on `feature/premium-admin-ui-v2`.
