# HOAHub v1.1 Implementation Plan

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