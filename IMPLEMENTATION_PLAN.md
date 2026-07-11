# HOAHub v1.1 Implementation Plan

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
