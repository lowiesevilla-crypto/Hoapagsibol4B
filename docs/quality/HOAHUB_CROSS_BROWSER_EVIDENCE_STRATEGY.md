# HOAHub Cross-Browser Evidence Strategy

Status: IN_PROGRESS — EDGE IMPLEMENTATION ACTIVE
Last updated: 2026-08-27
Tracking: #196, #192

## Baseline

The strategy increment completed in PR #217 from verified PR #216 merge `c79231c86e0c659130326046b5b338b815166620`.

PR #217 exact head `d979148357f6c9781a5d66ef412fac1b7536b501` passed:

- HOAHub MySQL CI #1276
- HOAHub Canva Visual Parity #405

PR #217 merged to `main` as `d8f9f93dc51b27700452a5ea6b9c21e516752580`.

The WCAG critical-flow gate covers Login, Homeowner Search, Billing, Record Payment, Documents, Complaints, and the homeowner mobile portal using non-destructive authenticated browser checks.

## Objective

Define and implement reproducible browser-compatibility evidence without weakening the existing Chromium release gate or using production tenant data for destructive testing.

## Sequence

1. Edge evidence strategy — DEFINED; IMPLEMENTATION ACTIVE
   - Reuse the existing authenticated WCAG critical-flow authority and disposable CI/E2E tenant data.
   - Run against an actual Microsoft Edge executable on the GitHub-hosted CI runner.
   - Fail closed if Edge is unavailable; never substitute Chromium and call it Edge evidence.
   - Keep the Edge job isolated from the existing authoritative Chromium gate so no current release test is weakened or replaced.

2. Firefox evidence strategy — DEFINED; IMPLEMENTATION PENDING
   - Identify the smallest safe browser-runner extension that can execute representative critical homeowner/admin paths without changing business logic.
   - Keep failures authoritative; do not skip incompatible assertions merely to produce a green run.

3. Android/iOS browser evidence — PENDING
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

## Edge implementation increment

Branch: `test/edge-critical-flow-evidence-20260827`
Baseline: PR #217 merge `d8f9f93dc51b27700452a5ea6b9c21e516752580`

The increment:

- extends the existing authenticated WCAG critical-flow runner with explicit `HOAHUB_E2E_BROWSER=edge` selection;
- accepts only a real `microsoft-edge` / `microsoft-edge-stable` executable for Edge evidence;
- refuses browser fallback when Edge was requested;
- adds an isolated `HOAHub Edge Critical Flow` pull-request workflow using disposable MySQL/E2E data;
- performs authenticated navigation/accessibility checks only and does not intentionally mutate production or live tenant data;
- leaves HOAHub MySQL CI and Canva Visual Parity mandatory on the exact final PR head.

## Safety and release gates

- No production tenant mutation or destructive live-data test.
- No finance/payment/payroll/RBAC/tenant-isolation business-rule change in this browser-evidence increment.
- Existing HOAHub MySQL CI and Canva Visual Parity remain mandatory on the exact PR head.
- Edge evidence must also pass on the exact implementation head before this Edge increment is considered complete.
- Any added cross-browser check must fail closed when a critical path genuinely regresses.
- Browser-specific exceptions require documented technical justification; tests may not be weakened to accommodate a failing browser.

## Exit criteria

- Edge evidence strategy defined and implemented or explicitly blocked by a verified CI/runtime limitation.
- Firefox evidence strategy defined and implemented or explicitly blocked by a verified CI/runtime limitation.
- Android/iOS critical homeowner-flow evidence recorded with automation vs controlled-manual boundaries explicit.
- Master Regression Matrix and Work Status Register reconciled with exact-head evidence before merge/completion.
