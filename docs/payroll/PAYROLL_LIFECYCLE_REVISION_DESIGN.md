# Payroll Lifecycle and Revision Contract

Status: **IN_PROGRESS**  
Task: `PAY-TASK-005`  
Requirements: `PAY-RUN-001`, `PAY-RUN-003`

## Purpose

This document defines the lifecycle and immutable correction contract that the persistence migration and payroll actions must implement. It deliberately separates the target policy from the legacy `PayrollStatus` enum so incomplete persistence is not represented as completed functionality.

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

## Persistence work still required

1. Expand persisted payroll lifecycle without mutating legacy historical rows incorrectly.
2. Add first-class `PayrollCalculationRevision` persistence and relations to payroll/payslip snapshots.
3. Add a correction/reversal record with actor, reason, parent revision and immutable delta evidence.
4. Update payroll actions so finalized/posted/paid values cannot be mutated directly.
5. Wire finance posting states to `POSTING`, `POSTED`, and `POST_FAILED` only after the idempotent finance posting contract exists.
6. Backfill existing calculated draft, finalized and paid periods into safe revision-1 evidence.

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