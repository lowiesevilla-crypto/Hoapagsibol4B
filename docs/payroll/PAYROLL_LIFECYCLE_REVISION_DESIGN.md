# Payroll Lifecycle and Revision Contract

Status: **VERIFIED**
Task: `PAY-TASK-005`
Requirements: `PAY-RUN-001`, `PAY-RUN-003`

## Purpose

This document defines the lifecycle and immutable correction contract implemented by the persistence migration and payroll actions. Exact-head PR #165 HOAHub MySQL CI #1111 and Canva Visual Parity #300 passed at `1743245f3d676f50fe026cf6831e9663ab8a666b`.

## Canonical run lifecycle

`DRAFT -> CALCULATED -> FINALIZED -> POSTING -> POSTED -> PAID`

Posting failure is recoverable only through `POSTING -> POST_FAILED -> POSTING`. A paid run is terminal.

`CALCULATED -> DRAFT` is permitted before finalization when the payroll manager intentionally discards a calculation and returns to editable inputs. Destructive deletion remains `DRAFT` only.

## Immutable correction rule

A payroll run at `FINALIZED` or later must never be corrected by overwriting the finalized calculation. A correction must create a new immutable payroll revision with:

- tenant and payroll-period identity;
- monotonic revision number;
- revision type (`INITIAL`, `CORRECTION`, `REVERSAL`, or `DELTA`);
- required correction/reversal reason;
- actor and timestamp;
- immutable calculation/configuration/statutory snapshots;
- parent revision identity when applicable;
- delta values where a posted run is corrected;
- finance posting/reversal linkage when the Financial Engine is enabled.

The existing `PayrollArchive` pre-reopen snapshot is retained as compatibility evidence until the first-class revision model is migrated. It is not the final revision persistence design.

## Implemented persistence contract

1. Persisted lifecycle expands without rewriting legacy historical payslip values.
2. `PayrollCalculationRevision` and per-employee revision snapshots retain first-class immutable evidence.
3. Correction/reversal revisions retain actor, required reason, parent/source revision and immutable delta evidence.
4. Payroll and attendance actions block direct mutation of finalized/posted/paid values.
5. `POSTING`, `POSTED`, and `POST_FAILED` are driven only by the durable tenant/revision/event outbox. A successful accrual journal reaches `POSTED`; a separate successful payment journal reaches `PAID`; failures remain retryable with the same idempotency identity.
6. Existing calculated, finalized, and paid periods are backfilled into deterministic revision-1 evidence.

## Acceptance criteria

`PAY-TASK-005` must remain `IN_PROGRESS` until all of the following pass on the exact PR head:

- Prisma validate/generate/migrate against MySQL;
- lifecycle transition unit tests;
- correction/revision persistence tests;
- tenant-isolation tests for revision reads/writes;
- finalized/posted/paid immutability tests;
- build/typecheck;
- application browser smoke suite;
- exact-head CI and visual-parity workflows.

Only after this evidence and merge may the corresponding requirements be considered for `VERIFIED`.
