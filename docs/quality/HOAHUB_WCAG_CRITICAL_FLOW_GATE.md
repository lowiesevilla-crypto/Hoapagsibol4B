# HOAHub WCAG 2.1 AA Critical-Flow Gate

Status: IN_PROGRESS
Started: 2026-08-27
Tracking: #196, #192
Baseline: `d189466979df5de83ec0c5330b33e3a4f3b78152`

## Objective

Establish repeatable WCAG 2.1 AA evidence for HOAHub critical administrator and homeowner workflows without changing tenant authority, finance/payment behavior, payroll logic, document authority, or production tenant data.

## Critical paths

- Login
- Homeowner search
- Billing
- Record Payment
- Documents
- Complaints
- Homeowner mobile portal

## Required evidence

For each critical path, validate the applicable WCAG 2.1 AA behavior for:

- keyboard-only operation and logical focus order;
- visible focus indication;
- accessible names and labels for interactive controls;
- validation/error identification and programmatic association;
- semantic headings, landmarks, tables, dialogs, and status messages;
- color contrast for text and meaningful non-text UI states;
- practical touch-target behavior on homeowner mobile routes;
- no keyboard traps;
- no critical automated accessibility violations on the tested route state.

## Execution guardrails

- Use disposable CI/E2E tenants and existing controlled fixtures only.
- Do not mutate live production tenant data for accessibility testing.
- Do not weaken existing browser, CI, visual-parity, RBAC, tenant-isolation, finance, or release gates.
- Fix only defects proven by the gate and keep changes scoped to the affected route/component.
- Merge only after HOAHub MySQL CI and Canva Visual Parity pass on the exact PR head.

## Planned implementation sequence

1. Add a reusable browser accessibility assertion helper compatible with the existing Chromium E2E harness.
2. Add login and authenticated-admin semantic/keyboard/focus coverage.
3. Add homeowner search, billing, and Record Payment coverage.
4. Add Documents and Complaints coverage.
5. Add homeowner mobile route coverage including practical touch-target checks.
6. Record defects, fixes, and exact-head evidence in the master regression matrix and work status register.

## Exit criteria

The gate is VERIFIED only when all listed critical routes have repeatable automated/manual evidence, no blocking WCAG 2.1 AA defects remain on those routes, and the exact-head required CI/visual checks pass before merge.
