# HOAHub Cross-Browser Evidence Strategy

Status: IN_PROGRESS — FIREFOX IMPLEMENTATION ACTIVE
Last updated: 2026-08-27
Tracking: #196, #192

## Baseline

The strategy increment completed in PR #217 from verified PR #216 merge `c79231c86e0c659130326046b5b338b815166620`.

PR #217 exact head `d979148357f6c9781a5d66ef412fac1b7536b501` passed HOAHub MySQL CI #1276 and HOAHub Canva Visual Parity #405, then merged to `main` as `d8f9f93dc51b27700452a5ea6b9c21e516752580`.

The WCAG critical-flow gate covers Login, Homeowner Search, Billing, Record Payment, Documents, Complaints, and the homeowner mobile portal using non-destructive authenticated browser checks.

## Objective

Define and implement reproducible browser-compatibility evidence without weakening the existing Chromium release gate or using production tenant data for destructive testing.

## Sequence

1. Edge evidence strategy — COMPLETE
   - PR #220 exact head `6f6e3e62febcd61b584051e73d23594d400722ad` passed HOAHub MySQL CI #1284, HOAHub Canva Visual Parity #411, and HOAHub Edge Critical Flow #4.
   - PR #220 merged to `main` as `16b4d256a4a3b805cb279e70bb52d7db8864b0cc`.
   - Evidence requires an actual Microsoft Edge executable and fails closed rather than substituting Chromium.

2. Firefox evidence strategy — IMPLEMENTATION ACTIVE
   - Branch: `test/firefox-critical-flow-evidence-20260827` from verified PR #220 merge `16b4d256a4a3b805cb279e70bb52d7db8864b0cc`.
   - Reuse the authenticated WCAG critical-flow authority and disposable CI/E2E tenant data.
   - Require an actual Mozilla Firefox executable and fail closed if unavailable.
   - Keep failures authoritative; do not skip incompatible assertions merely to produce a green run.
   - Keep Firefox evidence isolated from the existing Chromium and Edge release evidence.

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

## Safety and release gates

- No production tenant mutation or destructive live-data test.
- No finance/payment/payroll/RBAC/tenant-isolation business-rule change in these browser-evidence increments.
- HOAHub MySQL CI and Canva Visual Parity remain mandatory on every exact implementation head.
- Firefox evidence must also pass on the exact Firefox implementation head before the Firefox increment is considered complete.
- Any added cross-browser check must fail closed when a critical path genuinely regresses.
- Browser-specific exceptions require documented technical justification; tests may not be weakened to accommodate a failing browser.

## Exit criteria

- Edge evidence strategy defined and implemented or explicitly blocked by a verified CI/runtime limitation.
- Firefox evidence strategy defined and implemented or explicitly blocked by a verified CI/runtime limitation.
- Android/iOS critical homeowner-flow evidence recorded with automation vs controlled-manual boundaries explicit.
- Master Regression Matrix and Work Status Register reconciled with exact-head evidence before merge/completion.
