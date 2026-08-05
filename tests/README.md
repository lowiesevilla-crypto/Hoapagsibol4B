# HOAHub Automated Tests

This directory contains deterministic automated tests that run on every pull request.

## Commands

```bash
pnpm test
pnpm test:unit
```

Both commands execute the unit suite through Node's built-in test runner using the repository's existing `tsx` runtime.

## Structure

- `tests/fixtures/` contains deterministic, non-production test data.
- `tests/unit/` contains pure unit and policy tests.
- Future `tests/integration/` tests must use the disposable CI database and clean up their own records.
- Future `tests/e2e/` tests will contain critical browser journeys.

## Current baseline

The initial suite covers:

- tenant role hierarchy and multiple-role capability union;
- privilege-assignment restrictions;
- Tenant A versus Tenant B record isolation;
- safe denial for missing or unauthorized records;
- tenant filter override protection;
- payment applied and unapplied credit calculations;
- payment coverage normalization, validation, and year boundaries.

## Test quality rules

- Tests must be deterministic and safe to repeat.
- Finance tests must assert exact centavo results.
- Authorization tests must include allowed and denied cases.
- Tenant-isolation tests must use at least two independent tenant identifiers.
- A regression fix must include a test that would fail when the defect is reintroduced.
- Shared CI tests must never require a production database or production credentials.
