# HOAHub Cross-Browser Evidence Strategy

Status: IN_PROGRESS — MOBILE BROWSER EVIDENCE ACTIVE
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

2. Firefox evidence strategy — COMPLETE
   - PR #221 exact head `7cf132740996da10114440827064ce6a592a3f20` passed HOAHub MySQL CI #1286, HOAHub Canva Visual Parity #412, HOAHub Firefox Critical Flow #1, and HOAHub Edge Critical Flow #5.
   - PR #221 merged to `main` as `ffb753b7085282d8b2827512bdb14e4cea1c1331`.
   - Evidence requires an actual Mozilla Firefox executable and fails closed rather than substituting Chromium or Edge.

3. Android/iOS browser evidence — IMPLEMENTATION ACTIVE
   - Branch: `test/mobile-browser-evidence-20260827` from verified PR #221 merge `ffb753b7085282d8b2827512bdb14e4cea1c1331`.
   - Reuse disposable E2E tenant data and authenticated homeowner critical flows only.
   - Use deterministic mobile-browser emulation only for behavior that emulation can actually prove: viewport/layout, touch-sized navigation surfaces, responsive shell behavior, authenticated route navigation, and non-destructive read paths.
   - Do not claim Chromium device emulation proves Android Chrome engine-specific behavior unless the actual browser executable is used.
   - Do not claim Chromium or Firefox emulation proves iOS Safari/WebKit behavior. Any real iOS/Safari evidence must come from an actual WebKit-capable automated environment or controlled real-device/manual UAT.
   - Keep real-device/manual evidence non-destructive and tenant-controlled.

## Required homeowner mobile flows

- Login and logout/re-authentication.
- Homeowner mobile shell/dashboard.
- Statement of Account and payment-history read paths.
- Document request/history read paths that do not submit destructive/live mutations.
- Announcements/community navigation.
- Profile and responsive navigation shell.

## Mobile evidence acceptance boundary

Automated evidence may be accepted for viewport-responsive behavior, accessible navigation, route rendering, read-only content visibility, and session continuity using disposable CI fixtures.

The following must not be overclaimed from generic browser emulation:

- iOS Safari/WebKit engine compatibility.
- native browser permission prompts.
- installed-PWA behavior dependent on the operating system.
- camera/file-picker integration.
- payment-app handoff or external wallet behavior.
- real-device keyboard, safe-area, viewport-resize, or OS chrome behavior unless tested in that environment.

Where those behaviors are release-critical, evidence must be recorded as controlled real-device/manual UAT or a dedicated browser-engine automation run.

## Safety and release gates

- No production tenant mutation or destructive live-data test.
- No finance/payment/payroll/RBAC/tenant-isolation business-rule change in these browser-evidence increments.
- HOAHub MySQL CI and Canva Visual Parity remain mandatory on every exact implementation head.
- Edge and Firefox evidence remain intact and authoritative; mobile work must not weaken or replace those gates.
- Any added mobile check must fail closed when a critical path genuinely regresses.
- Browser-specific exceptions require documented technical justification; tests may not be weakened to accommodate a failing browser.

## Exit criteria

- Edge evidence complete with actual Edge execution.
- Firefox evidence complete with actual Firefox execution.
- Android/iOS critical homeowner-flow evidence recorded with automation vs controlled-manual boundaries explicit.
- Any remaining real-device/WebKit prerequisite is named as a blocker rather than represented as passed.
- Master Regression Matrix and Work Status Register reconciled with exact-head evidence before merge/completion.
