# Billing Manila Boundary and Automatic Toggle Hotfix

Status: IMPLEMENTED ON CANDIDATE BRANCH — production deployment and authenticated UAT pending.

Branch: `fix/billing-manila-boundary-toggle-sync-20260901`

## Incident

Two defects were confirmed in the Tenant Admin Billing Rules editor:

1. `/admin/settings/billing-rules` resolved the current effective rule and default start period with `Date#getUTCFullYear()` / `Date#getUTCMonth()`. During the first eight hours of a new calendar month in the Philippines, UTC is still in the previous month. For example, 2026-09-01 00:30 Asia/Manila is 2026-08-31 16:30 UTC, so a valid September rule could be reported as not covering the current month.
2. `BillingAutomationToggle` initialized React state from the selected rule only once. When the edit target changed, the switch and billing-day input could retain stale values. Because the hidden `generationMode` field is derived from the switch state, saving a rule from stale UI state could submit `MANUAL` even when the selected database rule was `AUTOMATIC`.

## Fix

- Added `lib/manila-time.ts` as the explicit Asia/Manila business-calendar helper for Billing Rules UI period resolution.
- Billing Rules now resolves the current effective rule and default effective start month/year from `getManilaClock()` instead of UTC date fields.
- The Automatic Billing editor is keyed by the selected rule ID and also synchronizes `automatic` and `billingDay` state whenever the selected rule defaults change.
- The billing-day input is controlled so its visible value and status text remain aligned with the submitted value.
- Added regression coverage for the August 31 UTC / September 1 Manila boundary and the year boundary.

## Scheduler and Duplicate Safety

The automatic billing scheduler itself was inspected and was already using an explicit `Asia/Manila` calendar via `manilaClock(now)`. No scheduler algorithm change is required for this incident.

Existing safety remains unchanged:

- catch-up runs when the Manila calendar day is on or after the configured billing day;
- completed monthly dues runs are audited and skipped on repeat execution;
- same-period Monthly Dues generation remains duplicate-safe;
- homeowners are processed in bounded batches of 250;
- rental invoices remain guarded by `INSERT IGNORE` and tenant-scoped serializable processing.

## Release Gate

Before this hotfix is reported as production complete:

1. Exact candidate head must pass applicable HOAHub CI, unit tests, typecheck/build, and UI/browser gates.
2. Merge only that exact passing head to `main`.
3. Confirm Hostinger managed deployment/release marker for the merged commit.
4. Authenticated tenant UAT must confirm that the September effective rule is shown as current and an AUTOMATIC rule opens with the switch ON and correct billing day.
5. Verify the September Monthly Dues run/audit/bill counts before attempting any recovery execution. Any recovery must use the existing idempotent automatic-generation path; do not create duplicate bills manually.
