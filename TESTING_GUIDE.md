# HOAHub Testing Guide

**Product:** HOAHub – Multi-Tenant Digital Community Management Platform  
**Version:** 1.2  
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
- validation and authorization helpers.

Run:

```bash
pnpm test
```

### 3.2 Integration testing

Verify module and persistence boundaries against a disposable MySQL database.

Priority examples:

- billing rule → preview → generation;
- billing → payment → allocation → receipt → statement of account;
- payment void/refund → ledger and balance recalculation;
- document request → fee payment → approval → generation;
- tenant/user/role and homeowner/property relationships.

Run after migrations and seed:

```bash
pnpm test:integration
```

### 3.3 Security and tenant-isolation testing

Verify allowed and denied scenarios for:

- tenant-scoped reads, writes, exports, attachments, and generated documents;
- role and permission enforcement;
- homeowner ownership boundaries;
- session creation, expiry, revocation, and recovery;
- client-supplied identifiers and retry behavior;
- sensitive audit logging and safe error output.

The integration suite uses at least two independent tenants and includes repeated, concurrent, allowed, and denied finance scenarios.

### 3.4 Regression verification

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

### 3.5 End-to-end and browser testing

The supported browser layer uses `puppeteer-core` with Chrome or Chromium against the production Next.js build.

The critical browser suite currently validates:

- seeded system-administrator authentication;
- billing preview and generation through the administrator UI;
- payment recording through the administrator UI;
- official receipt rendering and numbering;
- homeowner mobile authentication and Statement of Account visibility;
- homeowner and administrator visibility of a tenant-scoped document request;
- announcement publication to the correct tenant;
- denial of that announcement to a homeowner in a second tenant.

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

### 3.6 User acceptance testing

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

The CI workflow starts the production server, validates `/api/health`, executes the production smoke check, and then executes the critical browser suite. A failure in any layer blocks merging.

Additional domain-specific tests are required when the standard critical suites do not exercise the changed behavior.

## 5. Test selection rules

- Finance, authorization, tenant-isolation, destructive, migration, privacy, and recovery changes require explicit positive and negative scenarios.
- A bug fix requires a regression check that fails before the fix or otherwise proves the original defect.
- A database change requires migration, seed compatibility, backup/recovery impact, and data-integrity validation.
- A user-facing change requires responsive/mobile and accessibility review where applicable.
- A production incident fix requires a documented reproduction, remediation validation, and monitoring or prevention follow-up.
- Skipping or weakening a critical test requires a documented reason and product/engineering approval; skipped critical tests cannot become a permanent normal state.

## 6. Local validation safety

Before running a script, inspect whether it:

- requires a specific local production clone;
- mutates or resets database records;
- uploads or deletes files;
- depends on environment secrets;
- assumes a clean Git working tree.

Never point verification or browser-fixture scripts at production. Browser fixtures use reserved `E2E` identifiers, a future billing period, and two test-only homeowner identities, but they remain destructive test data and require a disposable database.

## 7. Mobile testing

Verify critical flows on approved desktop, tablet, and mobile viewports. Check:

- navigation and role-aware routing;
- forms, validation, focus, and error recovery;
- tables/cards and overflow;
- dialogs and touch targets;
- offline/cache behavior;
- receipts, statements, documents, and downloads;
- authenticated data not being cached or exposed incorrectly.

The automated browser suite uses a desktop administrator viewport and a 390 × 844 homeowner viewport.

## 8. Release approval

A release is approved only when:

- development and documentation are complete;
- mandatory CI gates pass;
- required domain-specific and security tests pass;
- UAT passes for affected workflows;
- backup/restore and operational readiness are confirmed where required;
- no unresolved release-blocking defect remains;
- the product owner records approval.

## 9. Issue #25 progression

Issue #25 now includes CI-enforced unit, database integration, security/tenant-isolation, critical regression, production smoke, and critical browser layers. Remaining work should focus on expanding deterministic scenario coverage, including browser-driven homeowner registration and full document approval/generation where those workflows require additional stable test packages.

## Document history

| Version | Date | Description |
|---|---|---|
| 1.0 | July 11, 2026 | Initial testing guide |
| 1.1 | August 5, 2026 | Added mandatory lint and `test:critical` CI gate; clarified CI-safe versus local-clone-only verification |
| 1.2 | August 5, 2026 | Added disposable MySQL integration and production-build critical browser test processes |
