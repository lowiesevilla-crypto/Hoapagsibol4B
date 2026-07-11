# Session Progress

## 2026-07-11 - Sprint 2.3 Automated Billing Generation Engine

Branch:
feature/billing-generation-engine

Completed:

- Added a preview-first Billing Generation panel on `/admin/billing`.
- Reused and expanded `lib/services/billing-rules.ts` for preview and generation instead of creating parallel billing logic.
- Added generation scopes for all eligible homeowners, individual homeowner, selected homeowners, block, and phase when data exists.
- Added searchable homeowner selection for individual and selected generation.
- Preview shows tenant, coverage period, effective rule, rule amount, resolution reference, generation mode, eligible count, exempt count, duplicate count, invalid/skipped count, projected bill count, projected total, due date, and a detailed homeowner table.
- Generation creates only eligible bills, stores recurring charge type, coverage year/month, billing rule ID, billing rule snapshot, resolution reference, amount, total, balance, and status.
- Duplicate and exemption handling are idempotent; rerunning the same selected generation did not create duplicates.
- Audit logs now record generation summary plus exemption skips, duplicate skips, and row-level failures.
- Automatic scheduled generation remains deferred; the cron endpoint still records deferred status only.
- Left Prisma schema and migrations unchanged.

Validation:

- Pre-flight passed on `feature/billing-generation-engine`; working tree was clean and last commit was `f91fe4b`.
- Service preview for December 2026 found the active rule `Initial monthly dues rate`, 500 eligible homeowners, 0 duplicates, 0 exemptions, 500 projected bills, and projected total PHP 300,000.
- Disposable selected-homeowner generation for December 2199 created 1 bill, skipped 1 temporary exemption, stored rule ID/snapshot/resolution reference, and used due date `2199-12-15`.
- Idempotency check reran the same selected generation and created 0 bills, skipped 1 duplicate, and skipped the same exemption.
- Cleanup removed the disposable bill, temporary exemption, and generated audit rows.
- Rendered `/admin/billing?preview=1&coverageYear=2026&coverageMonth=12&scope=ALL` returned HTTP 200 and included the generation panel, preview table, rule reference, generate button, manual bill form, and exemptions section.
- Tenant isolation still requires tenant context and blocks cross-tenant billing queries.
- pnpm exec prisma validate: Passed
- pnpm exec prisma generate: Passed
- pnpm typecheck: Passed
- pnpm build after removing `.next`: Passed

Not included:

- No scheduled automatic execution.
- No Prisma schema or migration changes.
- No payment, receipt, authentication, tenant routing, or existing migration changes.

## 2026-07-11 - Sprint 2.2 End Period Display and Clearing Fix

Branch:
feature/billing-rules-engine

Completed:

- Fixed Bug #049 by replacing Date-based month display with a deterministic month-name array indexed by `month - 1`.
- Updated optional end-period parsing so submitted blank strings become `null`, numeric strings like `"12"` become numbers, and absent fields remain distinguishable.
- Updated Billing Rule save mapping to use `FormData.has()` so explicit clearing writes `effectiveEndYear: null` and `effectiveEndMonth: null`, while omitted fields can preserve existing values.
- Left Prisma schema, migrations, billing calculations, duplicate billing prevention, exemption logic, auth/RBAC, tenant routing, notifications, payments, and receipts unchanged.

Root causes:

- December display relied on JavaScript Date/locale formatting for a simple month label, leaving the UI vulnerable to month-index/timezone confusion instead of directly mapping persisted 1-12 values.
- Clearing both end-period fields used the same optional-number path as omitted fields, so blank submitted values could be treated like `undefined` instead of explicit `null`.

Validation:

- Test A: Set End Year `2026` and End Month `12`, confirmed persisted month `12`, December selected in edit mode, and history `January 2026 to December 2026`.
- Test B: Cleared both end fields, confirmed persisted `null/null`, empty edit fields, and history `January 2026 to Open Ended`.
- Test C: Edited notes only on an Open Ended rule and confirmed it remained Open Ended.
- Test D: End Year only returns `Choose an end month, or clear the end year for an open-ended rule.`
- Test E: End Month only returns `Enter an end year, or clear the end month for an open-ended rule.`
- Regression: Resolution Date populated and remained preserved as `2026-07-11`.
- Regression: Notification close and auto-dismiss both worked in the local browser.
- Regression: Created a disposable inactive Billing Rule and confirmed `January 2034 to December 2034` with stored month `12`.
- Regression: Billing Exemptions page and existing Billing page rendered without alerts.
- Regression: Tenant isolation still requires tenant context and blocks cross-tenant billing-rule queries.
- Cleanup: Temporary rules and audit entries were removed, and the local admin password hash was restored.
- pnpm exec prisma validate: Passed
- pnpm exec prisma generate: Passed
- pnpm typecheck: Passed
- pnpm build after removing `.next`: Passed

Not included:

- No Prisma schema or migration changes.
- No billing calculation, exemption, duplicate billing, auth, RBAC, tenant routing, payment, receipt, or notification changes.

## 2026-07-11 - Sprint 2.2 Billing Rule End Period Hotfix

Branch:
feature/billing-rules-engine

Completed:

- Tightened Billing Rule end-period validation to treat end year and end month as an explicit pair using null-aware checks.
- Updated Billing Rules history/current-period display so `Open Ended` appears only when both end year and end month are null.
- Added an `Incomplete end period` display fallback for any pre-existing partial stored state instead of mislabeling it as open-ended.
- Left notifications, billing calculations, duplicate billing logic, exemptions, auth/RBAC, tenant routing, payments, receipts, schema, and migrations unchanged.

Root cause:

- The save path already submitted `effectiveEndMonth` and converted `"12"` to numeric `12`, but the display logic treated any missing end-period side as open-ended. That could mask partial state and make the UI appear to ignore the selected end month. Validation also used truthy checks instead of explicit null-aware pair checks.

Validation:

- Test 1: Edited a temporary open-ended rule, set End Year `2026` and End Month `December`, saved, reopened, confirmed End Month value `12`, End Year `2026`, and history `January 2026 to December 2026`.
- Test 2: Changed notes only, saved, reopened, and confirmed End Year `2026` and End Month `12` remained unchanged.
- Test 3: Cleared both End Year and End Month, saved, reopened, and confirmed history `January 2026 to Open Ended`.
- Test 4: Submitted End Year without End Month and confirmed the precise validation message `Choose an end month, or clear the end year for an open-ended rule.`
- Regression: Resolution Date still populated as `2026-07-11` and stayed preserved during edits.
- Regression: Notification close removed the toast while field validation remained visible.
- Regression: Error notification auto-dismissed while field validation remained visible.
- Regression: Created a disposable inactive Billing Rule and confirmed history `January 2032 to December 2032`; DB showed `effectiveEndMonth: 12`.
- Regression: Billing Exemptions page rendered.
- Regression: Existing Billing page rendered.
- Cleanup: Temporary rules and audit entries were removed, and the local admin password hash was restored.
- pnpm exec prisma validate: Passed
- pnpm exec prisma generate: Passed after stopping leftover Next dev processes that held the Prisma DLL on Windows.
- pnpm typecheck: Passed
- pnpm build: Passed

Not included:

- No Prisma schema or migration changes.
- No billing calculation, exemption, duplicate billing, auth, RBAC, tenant routing, payment, receipt, or notification changes.

## 2026-07-11 - Sprint 2.2 Final Billing Rules UI Hotfix

Branch:
feature/billing-rules-engine

Completed:

- Fixed Billing Rule resolution date edit population by formatting stored Date/string values into date-input-safe `YYYY-MM-DD` without `toISOString()` timezone shifting.
- Separated field-level validation copy into `fieldMessage` so toast dismissal can remove transient `error`/`success` URL params without erasing field errors.
- Reworked the shared transaction toast to keep client-owned notification state, support close/Escape/timer dismissal, and clear toast query params after capture or dismissal.
- Adjusted development CSP so Next.js client hydration can run locally; production script policy remains strict.

Root causes:

- Bug #046: The edit form used ISO serialization for a date input, which can shift calendar days when a Date represents local midnight and can fail the strict `YYYY-MM-DD` date input contract.
- Bug #047: Toast state was tied directly to URL params, so notifications could reappear after navigation/refresh; local development also blocked Next's client runtime with CSP, preventing close and timer effects from hydrating.

Validation:

- Billing Rule edit form showed `resolutionDate=2026-07-11`, end month `12`, end year `2031`, notes, and inactive status for a temporary verification rule.
- Saved the temporary rule without changing the date, reopened edit mode, and confirmed `2026-07-11` remained populated.
- Success notification showed a close button, auto-dismissed after the success delay, and removed `success`/`message` query params.
- Error notification showed a close button, manually dismissed, and kept the field-level validation message through `fieldMessage`.
- Error notification auto-dismissed after the longer error delay while field-level validation remained visible.
- Mobile browser verification at 390px: Passed without horizontal overflow.
- Billing Exemptions page rendered.
- Existing Billing page rendered.
- Temporary verification rule and audit entries were removed, and the local admin password hash was restored.
- pnpm exec prisma validate: Passed
- pnpm exec prisma generate: Passed after stopping leftover Next dev processes that held the Prisma DLL on Windows.
- pnpm typecheck: Passed
- pnpm build: Passed

Not included:

- No Prisma schema or migration changes.
- No billing calculation, duplicate billing, exemption logic, payment, receipt, auth, RBAC, or tenant routing changes.

## 2026-07-11 - Sprint 2.2 Billing Rules Functional Hotfix

Branch:
feature/billing-rules-engine

Completed:

- Fixed Billing Rule optional field parsing so blank end period, resolution date, and notes are normalized instead of producing vague failures.
- Preserved tenant-scoped creates and updates while adding field-specific validation redirects for rule form errors.
- Improved overlap errors to identify the existing active rule that blocks the submitted effective period.
- Added server-side diagnostic logging for unexpected Billing Rule save failures without exposing secrets in the browser.
- Updated edit mode to load inactive rules and populate every persisted Billing Rule field, including end period, resolution date, notes, and active status.
- Removed permanent inline Billing Rules/Billing Exemptions notifications so the shared dismissible transaction toast is the single temporary notification.
- Hardened toast dismissal with click, Escape key, and auto-dismiss behavior.

Root causes:

- Bug #043: The July 2026 UAT create attempt overlapped an existing active open-ended rule; the UI also collapsed validation/server failures into generic notification text.
- Bug #044: Edit mode only fetched active records and the form did not expose the persisted `active` field, making inactive saved rules impossible to fully populate/edit.
- Bug #045: Billing settings pages rendered permanent inline query alerts in addition to the shared dismissible toast, so messages appeared non-dismissible.

Validation:

- Focused Billing Rule parse/create/edit verification: Passed
- pnpm exec prisma validate: Passed
- pnpm exec prisma generate: Passed
- pnpm typecheck: Passed
- pnpm build: Passed
- Mobile browser verification at 390px: Passed; toast close removed the error query and no horizontal overflow was detected.

Not included:

- No searchable homeowner selector.
- No scheduled automatic billing.
- No payment or receipt logic changes.
- No tenant routing or authentication changes.
- No new migration.

## 2026-07-11 - Sprint 2.2 Billing Rules Migration Safety Correction

Branch:
feature/billing-rules-engine

Completed:

- Removed the hardcoded `tenant_pagsibol4b_default` database default from `BillingRule.tenantId`; billing rule creates now assign `tenantId` from the authenticated server session.
- Removed the migration's automatic `BillingRule` backfill from homeowner dues and the PHP 1,200 fallback so no tenant receives an invented financial policy.
- Backfilled `Bill.coverageYear` and `Bill.coverageMonth` from non-null `billingMonth`, then made both fields required so the tenant/homeowner/charge/coverage unique index cannot be bypassed by MySQL `NULL` behavior.
- Backfilled `DuesExemption` period fields from `billingMonth`, then made `startYear`, `startMonth`, `endYear`, and `endMonth` required.
- Added the `BillingRule.tenantId -> Tenant.id` foreign key with `ON DELETE RESTRICT` and `ON UPDATE CASCADE`.
- Preserved legacy/manual billing: individual bill creation and dues data migration now write required coverage fields explicitly and do not require a configured `BillingRule`.
- Updated billing UI messaging to show when no billing rule is configured before rule-based generation.

Compatibility notes:

- Existing `Bill.billingMonth` and `DuesExemption.billingMonth` are already required date fields in the Prisma model, so migration backfills can safely derive valid months 1-12.
- If production contains out-of-band invalid date data, the NOT NULL alteration should be tested locally before deployment and the affected rows corrected before running deploy.

Validation:

- pnpm exec prisma validate: Passed
- pnpm exec prisma generate: Passed
- pnpm typecheck: Passed
- pnpm build: Passed
- Local read-only data compatibility check: Passed; no `Bill` or `DuesExemption` rows had null or invalid `billingMonth` values.

Not included:

- No `prisma migrate deploy`.
- No migration reset.
- No deployment.
- No push to develop or main.

## 2026-07-09 - Develop Tenant Login URL Release Blocker

Branch:
develop

Completed:

- Fixed tenant login URL behavior from Platform Tenant Management.
- Confirmed tenant list and tenant detail links point to `/{tenantSlug}/login`.
- Updated tenant login routing so Platform Admin and Super Admin sessions can preview tenant login pages without wrong redirects.
- Preserved existing redirect behavior for signed-in tenant users.

Validation:

- pnpm typecheck: Pending
- pnpm build: Pending

Not included:

- No deployment.
- No merge to main.
- No database migrations.
- No unrelated UI changes.

## 2026-07-09 - Phase 1 SUPER_ADMIN Platform Permission Hotfix

Branch:
feature/subscription-management

Completed:

- Fixed platform role inheritance so SUPER_ADMIN satisfies PLATFORM_ADMIN authorization checks.
- Updated the Platform layout to use the centralized `requireUser(Role.PLATFORM_ADMIN)` check.
- Preserved PLATFORM_ADMIN access to Platform Management pages.
- Preserved middleware blocking for HOA_ADMIN and tenant users on `/platform/*`.

Validation:

- pnpm typecheck: Passed
- pnpm build: Passed

Not included:

- No Prisma models.
- No database migrations.
- No payment gateway.
- No AI features.
- No production deployment.
