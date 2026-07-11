# HOAHub v1.1 Implementation Plan

## Sprint 2.3B Individual Billing and Payments Workflow Completion

- [x] Fix Bug #057: individual billing create now submits numeric coverage year/month into the Billing Generation preview without locale-dependent date parsing.
- [x] Fix Bug #058: individual billing uses the shared Billing Rules generation engine and persists rule linkage, snapshot, coverage, resolution reference, amount, and balance updates.
- [x] Fix Improvement #059: individual billing has a searchable full-dataset tenant-scoped homeowner selector.
- [x] Fix Bug #060: Payments are split into `/admin/payments/record`, `/admin/payments/requests`, `/admin/payments/active`, and `/admin/payments/history`; `/admin/payments` redirects safely.
- [x] Fix Bug #061: Record Payment uses server-side tenant-scoped search over current open balances with no arbitrary small client result limit.
- [x] Fix Bug #062: Billing generation and payment mutations revalidate Billing plus dedicated Payment routes so newly generated balances are immediately payable.
- [x] Preserve existing payment posting, official receipt generation, payment request review, Billing Exemptions, duplicate prevention, tenant isolation, and audit behavior.
- [x] Leave Prisma schema and migrations unchanged.
- [x] Run `pnpm exec prisma validate`.
- [x] Run `pnpm exec prisma generate`.
- [x] Run `pnpm typecheck`.
- [x] Clean `.next` and run `pnpm build`.

## Sprint 2.3A Finance Integration Hotfix

- [x] Fix Bug #050: Billing Preview now displays the effective Billing Rule, Resolution Reference, effective period, rule amount, generation mode, penalty configuration, and no-rule state.
- [x] Fix Bug #051: individual billing creation and preview use the shared Billing Rules generation service and persist Billing Rule linkage, snapshot, coverage fields, and Resolution Reference.
- [x] Fix Bug #052: generation counts are computed from the final normalized preview rows through one summary helper.
- [x] Fix Bug #053: generated bills remain the balance source of truth and Billing/Payments views are revalidated after generation.
- [x] Fix Bug #054: Record Payment now searches tenant-scoped open balances by homeowner name, block, lot, email, account ID, bill ID, resolution reference, and billing month.
- [x] Add Billing Preview search, sorting, pagination, and mobile table handling without changing summary counts.
- [x] Add Payments sub-navigation for Record Payment, Payment Requests, Active Payments, and Transaction History.
- [x] Preserve existing payment recording, receipt, exemption, duplicate-prevention, and audit behavior.
- [x] Leave Prisma schema and migrations unchanged.
- [x] Run `pnpm exec prisma validate`.
- [x] Run `pnpm exec prisma generate`.
- [x] Run `pnpm typecheck`.
- [x] Clean `.next` and run `pnpm build`.

## Sprint 2.3 Automated Billing Generation Engine

- [x] Reuse `lib/services/billing-rules.ts` as the single preview and generation engine.
- [x] Add preview for all eligible, individual homeowner, selected homeowners, block, and phase scopes.
- [x] Resolve tenant and authorization server-side; never accept tenant identity from client input.
- [x] Use the effective Billing Rule for the selected coverage period; do not invent rates when no rule exists.
- [x] Skip active Dues Exemptions that cover the selected period and show skip reason.
- [x] Skip duplicate bills by tenant, homeowner, charge type, coverage year, and coverage month.
- [x] Create eligible bills with coverage fields, billing rule ID, rule snapshot, resolution reference, rule amount, due date from rule due day, and existing balance behavior.
- [x] Record summary audit logs plus exemption, duplicate, and row-failure audit details.
- [x] Keep automatic scheduled execution deferred.
- [x] Leave Prisma schema and migrations unchanged.
- [x] Run `pnpm exec prisma validate`.
- [x] Run `pnpm exec prisma generate`.
- [x] Run `pnpm typecheck`.
- [x] Clean `.next` and run `pnpm build`.

## Sprint 2.2 End Period Display and Clearing Fix

- [x] Fix Bug #049: stored month `12` now displays as December using `MONTH_NAMES[month - 1]`.
- [x] Convert submitted blank end-period fields to `null` so clearing both fields saves Open Ended.
- [x] Preserve existing end-period values when fields are absent from an update request.
- [x] Keep Open Ended display limited to `effectiveEndYear === null && effectiveEndMonth === null`.
- [x] Verify End Year `2026` and End Month `12` persist and reopen as December 2026.
- [x] Verify clearing both end fields reopens as Open Ended.
- [x] Verify one-sided end-period validation messages.
- [x] Verify rule creation, resolution date preservation, notifications, exemptions page, billing page, and tenant isolation.
- [x] Leave schema, migrations, billing calculations, exemptions, duplicate billing, auth, RBAC, tenant routing, payments, receipts, and notifications unchanged.
- [x] Run `pnpm exec prisma validate`.
- [x] Run `pnpm exec prisma generate`.
- [x] Run `pnpm typecheck`.
- [x] Clean `.next` and run `pnpm build`.

## Sprint 2.2 Billing Rule End Period Hotfix

- [x] Fix Bug #048: Billing Rule end year and end month now validate as an explicit pair and preserve December as month `12`.
- [x] Show `Open Ended` only when both `effectiveEndYear` and `effectiveEndMonth` are null.
- [x] Show a clear validation error when only one end-period field is provided.
- [x] Verify editing an open-ended rule to December 2026, reopening, and seeing `December 2026` in history.
- [x] Verify notes-only edits preserve an existing defined end period.
- [x] Verify clearing both end fields returns the rule to Open Ended.
- [x] Leave schema, migrations, billing calculations, exemptions, duplicate billing, auth, RBAC, tenant routing, payments, receipts, and notifications unchanged.
- [x] Run `pnpm exec prisma validate`.
- [x] Run `pnpm exec prisma generate`.
- [x] Run `pnpm typecheck`.
- [x] Clean `.next` and run `pnpm build`.

## Sprint 2.2 Final Billing Rules UI Hotfix

- [x] Fix Bug #046: Billing Rule edit mode now formats `resolutionDate` as a stable `YYYY-MM-DD` value for the HTML date input.
- [x] Fix Bug #047: Billing Rules notifications now hydrate in local development, expose a working dismiss button, and auto-dismiss with separate success/error delays.
- [x] Preserve field-level validation messages after toast dismissal by separating `fieldMessage` from transient toast query parameters.
- [x] Verify saving an edited Billing Rule without changing the resolution date preserves the stored day.
- [x] Verify Billing Rules mobile layout at 390px without horizontal overflow.
- [x] Leave Prisma schema, migrations, billing calculations, exemptions logic, duplicate billing logic, auth, RBAC, tenant routing, payments, and receipts unchanged.
- [x] Run `pnpm exec prisma validate`.
- [x] Run `pnpm exec prisma generate`.
- [x] Run `pnpm typecheck`.
- [x] Clean `.next` and run `pnpm build`.

## Sprint 2.2 Billing Rules Functional Hotfix

- [x] Fix Bug #043: Billing Rule create submissions now parse blank optional fields safely and return precise validation/overlap errors.
- [x] Fix Bug #044: Billing Rule edit mode now loads inactive records and populates persisted end period, resolution date, notes, and active status.
- [x] Fix Bug #045: Billing settings notifications now rely on the dismissible shared toast instead of permanent inline query alerts.
- [x] Add server-side diagnostic logging for unexpected Billing Rule save errors.
- [x] Preserve tenant isolation for rule create/update/deactivate paths.
- [x] Preserve manual/automatic generation-mode selection without adding scheduled automatic billing.
- [x] Leave payment and receipt logic unchanged.
- [x] Avoid any new migration; no schema mismatch was proven.
- [x] Focused Billing Rule parse/create/edit verification.
- [x] Run `pnpm exec prisma validate`.
- [x] Run `pnpm exec prisma generate`.
- [x] Run `pnpm typecheck`.
- [x] Clean `.next` and run `pnpm build`.

## Sprint 2.2 Billing Rules Engine - Migration Safety Correction

- [x] Remove `BillingRule.tenantId` hardcoded database default while keeping `tenantId` required.
- [x] Require billing rule create/update actions to use the authenticated tenant context and ignore client-supplied tenant identity.
- [x] Remove automatic initial billing-rate creation from migration; no homeowner-derived or PHP 1,200 fallback rule is generated.
- [x] Keep manual legacy billing functional when no active `BillingRule` exists.
- [x] Show "No billing rule configured" where rule-based generation is unavailable.
- [x] Backfill `Bill.coverageYear` and `Bill.coverageMonth` from `billingMonth`, then enforce NOT NULL for reliable duplicate prevention.
- [x] Validate billing coverage months server-side through normalized billing-month parsing and generated month values 1-12.
- [x] Backfill `DuesExemption` period fields from `billingMonth`, then enforce NOT NULL.
- [x] Validate exemption months 1-12 and reject end periods earlier than start periods.
- [x] Add `BillingRule.tenantId -> Tenant.id` foreign key with `ON DELETE RESTRICT` and `ON UPDATE CASCADE`.
- [x] Validate with `pnpm exec prisma validate`.
- [x] Regenerate Prisma client with `pnpm exec prisma generate`.
- [x] Run `pnpm typecheck`.
- [x] Clean `.next` and run `pnpm build`.

Migration safety notes:

- Do not run `prisma migrate deploy` until the corrected migration has been reviewed locally.
- Do not use `prisma migrate reset`.
- Expected local migration test command after review: `pnpm exec prisma migrate dev --name billing_rules_engine_safety_check`.

## EPIC-002 Subscription & License Management

### Phase 1 — Database
- [ ] Add SubscriptionPlan model
- [ ] Add TenantSubscription model
- [ ] Add SubscriptionInvoice model
- [ ] Add SubscriptionPayment model
- [ ] Add PlatformAuditLog model
- [ ] Create Prisma migration
- [ ] Run migration locally
- [ ] Verify build

---

### Phase 2 — Backend

- [ ] CRUD Subscription Plans
- [ ] CRUD Tenant Subscription
- [ ] Manual Payment Recording
- [ ] Subscription Status Logic
- [ ] License Validation

---

### Phase 3 — Platform UI

- [ ] Platform Dashboard Cards
- [ ] Subscription List
- [ ] Subscription Details
- [ ] Payment History
- [ ] Plan Management

---

### Phase 4 — Security

- [ ] SUPER_ADMIN only
- [ ] PLATFORM_ADMIN only
- [ ] Tenant Isolation
- [ ] Audit Logs

---

### Phase 5 — Testing

- [ ] pnpm typecheck
- [ ] pnpm build
- [ ] GitHub Actions
- [ ] Local UAT
- [ ] Production UAT
# Sprint 2.3 Status

Completed
- Billing Generation Engine
- Duplicate Prevention
- Billing Rule Integration
- Billing Exemption Integration
- Billing Preview
- Bulk Generation

Deferred to Sprint 2.3A
- Individual Billing Generation
- Payment Synchronization
- Finance Navigation Improvements
- Resolution Reference Display
- Billing Preview Search
