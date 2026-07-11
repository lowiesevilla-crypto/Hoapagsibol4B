# Session Progress

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
