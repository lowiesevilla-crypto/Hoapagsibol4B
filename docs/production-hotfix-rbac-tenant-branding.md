# Production Hotfix Validation: RBAC, Tenant Access, Branding

## Scope

This hotfix focuses on:

- Tenant-scoped authentication and routing
- Role-based admin access
- Subscription/module-aware sidebar and direct URL blocking
- Tenant branding and logo management
- Default HOAHub logo for tenants without a custom logo

## Roles to Test

### SUPER_ADMIN / PLATFORM_ADMIN

Expected:

- Can access `/platform/tenants`
- Can open each tenant profile
- Can update tenant status, subscription, slug, module entitlements
- Can upload/reset tenant logo
- Can access all tenant modules for support/admin purposes

### HOA_ADMIN / SYSTEM_ADMIN / ADMIN

Expected:

- Can access normal admin modules inside their own tenant only
- Cannot access `/platform/*`
- Cannot see or access another tenant's data

### PAYROLL_MANAGER

Expected allowed modules:

- Dashboard
- Employees
- Attendance
- Payroll
- Reports
- Chat
- Announcements
- Events
- Documents
- Loans / Cash Advance when routes exist

Expected denied modules:

- Billing
- Payments
- Receipts
- Other Collections
- Expenses
- Data Management
- Platform tenant management

### BILLING_MANAGER

Expected allowed modules:

- Dashboard
- Billing
- Payments
- Receipts
- Other Collections
- Expenses
- Reports
- Chat
- Announcements
- Events
- Documents

Expected denied modules:

- Payroll
- Attendance
- Employees
- Platform tenant management

### STAFF

Expected allowed modules:

- Dashboard
- Chat
- Announcements
- Events
- Documents

### HOMEOWNER

Expected:

- Can access `/portal/*` only for their tenant
- Cannot access `/admin/*`, `/employee/*`, or `/platform/*`

### EMPLOYEE

Expected:

- Can access `/employee/*` only for their tenant
- Cannot access `/admin/*`, `/portal/*`, or `/platform/*`

## Tenant Routing Tests

1. Open `/{tenantSlug}/login` for Tenant A.
2. Confirm logo and tenant name match Tenant A.
3. Log in as Tenant A user.
4. Confirm dashboard/sidebar data belongs only to Tenant A.
5. Log out.
6. Open `/{tenantSlug}/login` for Tenant B.
7. Confirm logo and tenant name match Tenant B.
8. Log in as Tenant B user.
9. Confirm no Tenant A data appears.

## Module Entitlement Tests

1. As SUPER_ADMIN, disable a module for a test tenant.
2. Log in as a user under that tenant.
3. Confirm disabled module is hidden from sidebar.
4. Manually open the disabled module URL.
5. Confirm the system redirects with a module access error.

## Logo Tests

1. Open `/platform/tenants/{tenantId}` as SUPER_ADMIN.
2. Upload PNG/JPG/WEBP logo under Tenant Branding.
3. Save.
4. Open `/{tenantSlug}/login`.
5. Confirm tenant logo appears.
6. Reset logo to default HOAHub logo.
7. Confirm `/Hoahub-logo.png` appears.

## Production Deployment Commands

Run locally before deploy:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
```

Deploy using Hostinger flow:

```bash
pnpm hostinger:build
pnpm start
```

Smoke test after deployment:

```bash
pnpm smoke:production
```

## Production Environment Requirements

- `AUTH_SECRET` must be at least 32 characters in production.
- `DATABASE_URL` must point to the correct production MySQL database.
- `APP_URL` must match the production domain.
- `STORAGE_ROOT` must point to persistent storage if uploads should survive redeployments.
- Public default logo file must exist at `public/Hoahub-logo.png`.

## Rollback

If login or routing breaks after deployment:

1. Restore previous GitHub deployment commit from Hostinger.
2. Verify `AUTH_SECRET`, `APP_URL`, and `DATABASE_URL`.
3. Re-test `/{tenantSlug}/login` before allowing users back in.
