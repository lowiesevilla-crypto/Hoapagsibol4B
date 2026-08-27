# HOAHub Cross-Browser Evidence Strategy

Status: IN_PROGRESS
Last updated: 2026-08-27
Tracking: #196, #192

## Baseline

This increment starts from verified PR #216 merge `c79231c86e0c659130326046b5b338b815166620`.

PR #216 final head `40bd7aad82911762ab6e491f7296a3569fa679de` passed:

- HOAHub MySQL CI #1274
- HOAHub Canva Visual Parity #404

The WCAG critical-flow gate covers Login, Homeowner Search, Billing, Record Payment, Documents, Complaints, and the homeowner mobile portal using non-destructive authenticated browser checks.

## Objective

Define and implement reproducible browser-compatibility evidence without weakening the existing Chromium release gate or using production tenant data for destructive testing.

## Sequence

1. Edge evidence strategy
   - Reuse the existing critical-flow test authority and disposable CI/E2E tenant data.
   - Prefer the installed Microsoft Edge/Chromium channel where supported by CI; otherwise document an equivalent pinned browser/channel strategy before implementation.
   - Require the same critical navigation, authentication, tenant-isolation and non-destructive constraints as the current browser gate.

2. Firefox evidence strategy
   - Identify the smallest safe browser-runner extension that can execute representative critical homeowner/admin paths without changing business logic.
   - Keep failures authoritative; do not skip incompatible assertions merely to produce a green run.

3. Android/iOS browser evidence
   - Validate critical homeowner mobile flows with supported device/browser emulation where deterministic automation is feasible.
   - Record any behavior that requires controlled manual UAT rather than pretending emulation proves a real-device condition.

## Required critical flows

- Login and logout/re-authentication
- Homeowner mobile shell/dashboard
- Statement of Account / payment-history read paths
- Document request/history read paths
- Announcements/community navigation
- Admin Homeowner Search
- Admin Billing list/search
- Admin Documents and Complaints navigation

## Safety and release gates

- No production tenant mutation or destructive live-data test.
- No finance/payment/payroll/RBAC/tenant-isolation business-rule change in this strategy increment.
- Existing HOAHub MySQL CI and Canva Visual Parity remain mandatory on the exact PR head.
- Any added cross-browser check must fail closed when a critical path genuinely regresses.
- Browser-specific exceptions require documented technical justification; tests may not be weakened to accommodate a failing browser.

## Exit criteria

- Edge evidence strategy defined and implemented or explicitly blocked by a verified CI/runtime limitation.
- Firefox evidence strategy defined and implemented or explicitly blocked by a verified CI/runtime limitation.
- Android/iOS critical homeowner-flow evidence recorded with automation vs controlled-manual boundaries explicit.
- Master Regression Matrix and Work Status Register reconciled with exact-head evidence before merge/completion.
