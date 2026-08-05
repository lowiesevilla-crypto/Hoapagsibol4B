# HOAHub Automated Tests

This directory contains deterministic automated tests that run on every pull request.

## Commands

```bash
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:all
```

`pnpm test` and `pnpm test:unit` execute the pure unit suite through Node's built-in test runner using the repository's existing `tsx` runtime.

`pnpm test:integration` requires a migrated disposable MySQL test database through `DATABASE_URL`. It creates uniquely named temporary tenants, never reuses seeded tenant records, and removes its own records after execution. Never point this command at production.

`pnpm test:all` runs unit and database integration tests in sequence.

## Structure

- `tests/fixtures/` contains deterministic, non-production test data.
- `tests/unit/` contains pure unit and policy tests.
- `tests/integration/` contains disposable-database service and persistence tests.
- Future `tests/e2e/` tests will contain critical browser journeys.

## Current baseline

The unit suite covers:

- tenant role hierarchy and multiple-role capability union;
- privilege-assignment restrictions;
- Tenant A versus Tenant B record isolation;
- safe denial for missing or unauthorized records;
- tenant filter override protection;
- payment applied and unapplied credit calculations;
- payment coverage normalization, validation, and year boundaries.

The database integration suite covers:

- tenant-scoped billing generation;
- repeated and concurrent duplicate-billing protection;
- cross-tenant billing identifier denial;
- payment idempotency and official receipt numbering;
- oldest-bill-first payment allocation and bill recalculation;
- statement-of-account totals and ledger balance;
- payment void archive, balance restoration, and audit records.

## Test quality rules

- Tests must be deterministic and safe to repeat.
- Finance tests must assert exact centavo results.
- Authorization tests must include allowed and denied cases.
- Tenant-isolation tests must use at least two independent tenant identifiers.
- Database integration tests must create uniquely identifiable records and clean them up.
- A regression fix must include a test that would fail when the defect is reintroduced.
- Shared CI tests must never require a production database or production credentials.
