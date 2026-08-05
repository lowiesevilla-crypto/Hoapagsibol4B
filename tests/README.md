# HOAHub Automated Tests

This directory contains deterministic automated tests that run on every pull request.

## Commands

```bash
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:all
pnpm test:critical
pnpm test:e2e
```

`pnpm test` and `pnpm test:unit` execute the pure unit and authorization-policy suite through Node's built-in test runner using the repository's existing `tsx` runtime.

`pnpm test:integration` requires a migrated disposable MySQL test database through `DATABASE_URL`. It creates uniquely named temporary tenants, never reuses seeded tenant records, and removes its own records after execution. Never point this command at production.

`pnpm test:all` runs unit and database integration tests in sequence. `pnpm test:critical` executes the CI-safe regression verifiers. `pnpm test:e2e` requires the prepared fixtures and a running production build; use `pnpm e2e:prepare` and `pnpm e2e:cleanup` only against an approved disposable database.

## Structure

- `tests/fixtures/` contains deterministic, non-production test data.
- `tests/unit/` contains pure calculation and authorization-policy tests.
- `tests/integration/` contains disposable-MySQL service, persistence, finance, authentication, and tenant-isolation tests.
- `tests/e2e/` contains critical browser journeys for business workflows, documents, RBAC, and stale-session behavior.

## Current baseline

The unit suite covers:

- protected application-route role boundaries;
- finance, document, payroll, and platform-administration separation;
- tenant role hierarchy and multiple-role capability union;
- privilege-assignment restrictions;
- Tenant A versus Tenant B record isolation;
- safe denial for missing or unauthorized records;
- tenant filter override protection for client-supplied identifiers;
- payment applied and unapplied credit calculations;
- payment coverage normalization, validation, rounding, and year boundaries.

The database integration suite covers:

- tenant-scoped billing generation;
- repeated and concurrent duplicate-billing protection;
- cross-tenant billing identifier denial;
- payment idempotency and official receipt numbering;
- oldest-bill-first payment allocation and bill recalculation;
- statement-of-account totals and ledger balance;
- payment void archive, balance restoration, receipt state, and audit records;
- password-reset completion, token replay denial, session revocation, and cross-tenant reset isolation;
- homeowner/user/property relationships where two tenants deliberately use overlapping address, block, and lot labels;
- cross-tenant homeowner-profile and collection-relation denial;
- partial and full bond refund liability recalculation;
- over-refund, closed-bond replay, and cross-tenant refund denial;
- preservation of the original official collection receipt and immutable refund audit references.

The browser suite covers:

- administrator authentication, billing generation, payment recording, and receipt rendering;
- homeowner mobile authentication, Statement of Account, registration, verification, activation, and fresh login;
- document request, approval, generation, download, history, and cross-tenant denial;
- announcement publication and tenant visibility;
- privileged server-action denial, role-change and deactivation session revocation, and stale-session rejection.

## Test quality rules

- Tests must be deterministic and safe to repeat.
- Finance tests must assert exact centavo results.
- Authorization tests must include allowed and denied cases.
- Tenant-isolation tests must use at least two independent tenant identifiers.
- Database integration tests must create uniquely identifiable records and clean them up.
- Tests for ownership must use overlapping human-readable data where practical so tenant identity remains the decisive boundary.
- Sensitive finance mutations must assert the persisted transaction, aggregate balance, original receipt relationship, audit evidence, and rejected replay behavior.
- A regression fix must include a test that would fail when the defect is reintroduced.
- Shared CI tests must never require a production database or production credentials.
- No critical test may be skipped or treated as an optional permanent check.
