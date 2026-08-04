# HOAHub Testing Guide

**Product:** HOAHub – Multi-Tenant Digital Community Management Platform  
**Version:** 1.1  
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

### 3.2 Integration testing

Verify module and persistence boundaries.

Priority examples:

- billing rule → preview → generation;
- billing → payment → allocation → receipt → statement of account;
- payment void/refund → ledger and balance recalculation;
- document request → fee payment → approval → generation;
- tenant/user/role and homeowner/property relationships.

### 3.3 Security and tenant-isolation testing

Verify allowed and denied scenarios for:

- tenant-scoped reads, writes, exports, attachments, and generated documents;
- role and permission enforcement;
- homeowner ownership boundaries;
- session creation, expiry, revocation, and recovery;
- client-supplied identifiers and retry behavior;
- sensitive audit logging and safe error output.

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

Critical user journeys should be automated with a supported browser framework as issue #25 progresses. Minimum target journeys are administrator registration, billing preview/generation, payment/receipt/SOA, homeowner mobile access, document request/approval, and announcement visibility.

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
pnpm test:critical
pnpm typecheck
pnpm build
```

The CI workflow also starts the production server and executes the production smoke check against `/api/health` and critical routes.

Additional domain-specific tests are required when the standard critical suite does not exercise the changed behavior.

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

Never point verification scripts at production unless the script and operating procedure explicitly authorize a safe, read-only production check.

## 7. Mobile testing

Verify critical flows on approved desktop, tablet, and mobile viewports. Check:

- navigation and role-aware routing;
- forms, validation, focus, and error recovery;
- tables/cards and overflow;
- dialogs and touch targets;
- offline/cache behavior;
- receipts, statements, documents, and downloads;
- authenticated data not being cached or exposed incorrectly.

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

This version establishes the first mandatory CI-safe critical verification gate. Issue #25 remains open until HOAHub also has the approved unit, integration, finance, authorization, tenant-isolation, and critical browser suites with repeatable isolated test data.

## Document history

| Version | Date | Description |
|---|---|---|
| 1.0 | July 11, 2026 | Initial testing guide |
| 1.1 | August 5, 2026 | Added mandatory lint and `test:critical` CI gate; clarified CI-safe versus local-clone-only verification |
