# HOAHub Testing Guide

**Product:** HOAHub – Multi-Tenant Digital Community Management Platform  
**Version:** 1.4  
**Last Updated:** August 5, 2026  
**Document Owner:** Lowie M. Sevilla

## 1. Purpose

This document defines the official HOAHub testing process. Every feature, bug fix, enhancement, and release candidate must be supported by evidence appropriate to its functional, security, tenant-isolation, finance, mobile, data, and operational risk.

Passing a production build alone is not sufficient release evidence.

## 2. Testing principles

Every release must be:

- functional;
- secure and authorized server-side;
- tenant isolated;
- finance and data-integrity safe;
- mobile responsive and accessible where applicable;
- auditable;
- deployable and recoverable;
- supported by repeatable validation.

## 3. Testing levels

### 3.1 Unit testing

Validate deterministic functions and rules independently.

Priority examples:

- billing calculations;
- penalties, discounts, exemptions, and adjustments;
- balance and allocation calculations;
- duplicate prevention and idempotency;
- validation, route policy, role, and tenant-scoping helpers.

Run:

```bash
pnpm test
```

`pnpm test` is the standard local automated test command and runs the deterministic unit and policy suite. Use `pnpm test:unit` when the explicit layer name is preferable.

### 3.2 Integration testing

Verify module and persistence boundaries against a disposable MySQL database.

Priority examples:

- billing rule → preview → generation;
- billing → payment → allocation → receipt → statement of account;
- payment void and bond refund → ledger/liability and balance recalculation;
- document request → fee payment → approval → generation;
- password recovery → token consumption → session revocation;
- tenant/user/role and homeowner/property relationships.

Run after migrations and seed:

```bash
pnpm test:integration
```

The integration command creates uniquely named tenants and records, uses `.invalid` identities, and removes its fixtures. It must never target production or a shared business-data database.

### 3.3 Security and tenant-isolation testing

Verify allowed and denied scenarios for:

- tenant-scoped reads, writes, exports, attachments, and generated documents;
- role and permission enforcement;
- homeowner ownership and property-profile boundaries;
- session creation, expiry, revocation, and recovery;
- client-supplied identifiers and retry behavior;
- sensitive audit logging and safe error output.

Isolation scenarios must use at least two independent tenants. Ownership scenarios should deliberately reuse human-readable data such as block, lot, address, or receipt sequence where practical so tenant and entity identity remain the decisive boundary.

The current automated matrix includes:

- protected-route allow and deny decisions for platform, admin, homeowner, and employee areas;
- finance, documents, payroll, community, and tenant-administration separation;
- trusted tenant filters overriding attacker-supplied tenant identifiers;
- cross-tenant homeowner-profile and collection-relation denial;
- cross-tenant bill, reset-token, session, document, announcement, and bond-refund denial;
- captured privileged server-action denial and stale-session rejection.

### 3.4 Finance and audit testing

Finance mutations require exact centavo assertions and complete persisted-state evidence. Tests must cover, as applicable:

- source transaction and aggregate balance;
- allocations, receipt number, and Statement of Account output;
- idempotency, repeated requests, concurrent requests, and invalid amounts;
- void, archive, refund, forfeiture, and restoration behavior;
- successful audit evidence and non-creation of misleading success audits after rejected attempts;
- unchanged state in every non-target tenant.

Bond refund tests assert partial refund, final closure, over-refund denial, closed-bond replay denial, the sum of immutable refund rows, preservation of the original collection receipt, a stable refund audit reference, and Tenant B remaining unchanged.

### 3.5 Regression verification

The repository contains targeted `scripts/verify-*.ts` checks. These are regression safeguards, not a substitute for comprehensive unit, integration, browser, and UAT coverage.

CI-safe critical checks are grouped under:

```bash
pnpm test:critical
```

The current critical suite covers:

- complaint-management integration and tenant safeguards;
- document-fee payment ownership, idempotency, and workflow safeguards;
- homeowner mobile shell, dashboard, community, payments, and requests;
- mobile hardening and PWA cache/offline protections.

Verification scripts that explicitly require `127.0.0.1 / hoahub_prodclone_local` are intentionally excluded from shared CI until they are refactored to use an isolated, disposable test database safely.

### 3.6 End-to-end and browser testing

The supported browser layer uses `puppeteer-core` with Chrome or Chromium against the production Next.js build.

The critical browser suites validate:

- system-administrator authentication;
- billing preview and generation;
- payment recording, allocation, and official receipt rendering;
- homeowner mobile authentication and Statement of Account visibility;
- tenant-scoped document request, approval, generated document, PDF download, history, and cross-tenant denial;
- announcement publication and tenant visibility;
- homeowner registration, email verification, activation, automatic session creation, and fresh login;
- platform-page denial and captured privileged server-action denial;
- role-change and deactivation session revocation;
- stale-session and inactive-account rejection;
- legitimate security-change audit evidence.

Commands:

```bash
pnpm e2e:prepare
pnpm test:e2e
pnpm e2e:cleanup
```

`e2e:prepare` and `e2e:cleanup` are destructive test-data operations. They are restricted to GitHub Actions or an explicitly authorized disposable local database using:

```bash
HOAHUB_E2E_ALLOW_LOCAL=1
```

The browser suite requires a running production build at `E2E_BASE_URL`, seeded administrator credentials, and a standard Chrome/Chromium executable. Set `PUPPETEER_EXECUTABLE_PATH` when the browser is installed outside the standard Linux paths.

### 3.7 User acceptance testing

UAT validates the approved business process and user experience after technical validation.

Each UAT result should identify:

- scenario and expected result;
- build/commit and environment;
- tenant and role;
- test data and execution steps;
- PASS/FAIL/BLOCKED result;
- evidence and linked defect;
- retest result;
- tester and approver.

## 4. Mandatory pull-request quality gates

Application changes must pass, as applicable:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm exec prisma validate
pnpm exec prisma generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm test
pnpm test:integration
pnpm test:critical
pnpm typecheck
pnpm build
pnpm e2e:prepare
pnpm test:e2e
pnpm e2e:cleanup
```

The CI workflow starts a clean MySQL service, applies every migration, runs the configuration seed, starts the production server, validates `/api/health`, executes production smoke checks, and runs all critical browser suites. A failure in any layer blocks merging.

Additional domain-specific tests are required when the standard suites do not exercise the changed behavior.

## 5. Test selection rules

- Finance, authorization, tenant-isolation, destructive, migration, privacy, and recovery changes require explicit positive and negative scenarios.
- A bug fix requires a regression check that fails before the fix or otherwise proves the original defect.
- A database change requires migration, seed compatibility, backup/recovery impact, and data-integrity validation.
- A user-facing change requires responsive/mobile and accessibility review where applicable.
- A production incident fix requires a documented reproduction, remediation validation, and monitoring or prevention follow-up.
- Skipping or weakening a critical test requires a documented reason and product/engineering approval; skipped critical tests cannot become a permanent normal state.
- A rejected mutation must be proven not to create transaction rows, aggregate changes, receipt changes, or success audit events.

## 6. Local validation safety

Before running a script, inspect whether it:

- requires a specific local production clone;
- mutates or resets database records;
- uploads or deletes files;
- depends on environment secrets;
- assumes a clean Git working tree.

Never point verification, integration, or browser-fixture scripts at production. Browser fixtures use reserved `E2E` identifiers, future billing periods, and test-only identities, but they remain destructive test data and require a disposable database.

Integration fixtures use process-specific tenant identifiers and clean their records in dependency-safe order. Database safety guards reject non-local hosts in CI and require explicit `HOAHUB_E2E_ALLOW_LOCAL=1` authorization for browser fixtures outside CI.

## 7. Mobile testing

Verify critical flows on approved desktop, tablet, and mobile viewports. Check:

- navigation and role-aware routing;
- forms, validation, focus, and error recovery;
- tables/cards and overflow;
- dialogs and touch targets;
- offline/cache behavior;
- receipts, statements, documents, and downloads;
- authenticated data not being cached or exposed incorrectly.

The automated browser suite uses desktop administrator viewports and a 390 × 844 homeowner viewport, including activation and fresh-login journeys.

## 8. Release approval

A release is approved only when:

- development and documentation are complete;
- mandatory CI gates pass;
- required domain-specific and security tests pass;
- UAT passes for affected workflows;
- backup/restore and operational readiness are confirmed where required;
- no unresolved release-blocking defect remains;
- the product owner records approval.

## 9. Issue #25 completion evidence

Issue #25 is satisfied when a clean pull-request run confirms all of the following without skipped critical checks:

- documented Node/tsx unit, disposable-MySQL integration, regression, smoke, and Puppeteer browser layers;
- `pnpm test` as the standard deterministic local suite;
- finance calculation, allocation, receipt, Statement of Account, duplicate-billing, void, and bond-refund coverage;
- two-tenant isolation for records, relationships, mutations, sessions, documents, announcements, and sensitive identifiers;
- allowed and denied RBAC scenarios for protected paths and privileged mutations;
- homeowner registration, activation, property ownership, and cross-tenant relationship coverage;
- repeatable fixture setup and dependency-safe cleanup;
- mandatory lint, migration, seed, tests, typecheck, production build, smoke, and browser gates that block merging on failure.

## Document history

| Version | Date | Description |
|---|---|---|
| 1.0 | July 11, 2026 | Initial testing guide |
| 1.1 | August 5, 2026 | Added mandatory lint and `test:critical` CI gate; clarified CI-safe versus local-clone-only verification |
| 1.2 | August 5, 2026 | Added disposable MySQL integration and production-build critical browser test processes |
| 1.3 | August 5, 2026 | Added browser-driven homeowner registration, invitation verification, activation, fresh login, and tenant-ownership coverage |
| 1.4 | August 5, 2026 | Added password-reset/session security, route-policy matrices, overlapping-property ownership isolation, audited bond-refund consistency, and final Issue #25 completion criteria |
