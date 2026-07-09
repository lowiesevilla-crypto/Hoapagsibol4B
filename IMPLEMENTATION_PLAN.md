# HOAHub v1.1 Implementation Plan

## Sprint 2.1 - Finance Engine Foundation

### Phase 1 - Homeowner Statement of Account

- [x] Add `/admin/homeowners/[id]/soa`
- [x] Add homeowner detail action for Statement of Account
- [x] Reuse existing bills, payments, homeowner collections, and bond refund records
- [x] Add HOA header, homeowner information, account summary, running ledger, payment history, billing history, and aging summary
- [x] Add print and PDF export actions
- [x] Keep SOA reads tenant-scoped and behind existing admin RBAC
- [ ] Add persisted public SOA verification model in a future phase
- [ ] Expand homeowner self-service SOA access in a future phase

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
