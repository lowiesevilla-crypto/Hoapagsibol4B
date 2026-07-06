# HOAHub Platform Management Module Design

## Objective

Build the central control center for managing HOAHub as a commercial multi-tenant SaaS platform.

This module is used by Platform Admins and Super Admins only.

---

## Platform Management Areas

### 1. Platform Dashboard

Purpose:
Provide executive visibility into the HOAHub SaaS business.

Metrics:
- Total tenants
- Active tenants
- Trial tenants
- Suspended tenants
- Total homeowners
- Total users
- Active subscriptions
- Expiring subscriptions
- Monthly recurring revenue
- Annual recurring revenue
- System health

---

### 2. Tenant Management

Purpose:
Manage HOA tenants.

Features:
- Create tenant
- Edit tenant
- Suspend tenant
- Reactivate tenant
- View tenant details
- Manage tenant modules
- Manage tenant users
- View tenant activity
- View tenant subscription

---

### 3. Subscription Management

Purpose:
Manage tenant plans, billing cycles, license status, and renewal dates.

Entities:
- Subscription Plan
- Tenant Subscription
- Subscription Invoice
- Subscription Payment

Features:
- Assign plan to tenant
- Set billing cycle
- Set trial period
- Set renewal date
- Set grace period
- Set payment status
- Suspend expired tenants
- Reactivate paid tenants
- View payment history

---

### 4. License Management

Purpose:
Control tenant access based on plan, status, and limits.

License Controls:
- Max homeowners
- Max users
- Max storage
- Enabled modules
- Trial expiration
- Subscription expiration
- Grace period
- Auto suspend

---

### 5. Platform Audit Logs

Purpose:
Track important platform-level actions.

Events:
- Tenant created
- Tenant updated
- Tenant suspended
- Tenant reactivated
- Subscription changed
- Payment recorded
- User created
- User role changed
- Module enabled/disabled

---

### 6. Platform Settings

Purpose:
Configure HOAHub system-wide information.

Settings:
- Platform name
- Platform logo
- Support email
- Support phone
- Website URL
- Version number
- Maintenance mode
- Default tenant logo
- Default trial duration
- Default grace period

---

### 7. System Health

Purpose:
Monitor production readiness and platform reliability.

Health Checks:
- Database status
- App health endpoint
- Storage availability
- Email configuration
- Cron job status
- Last deployment
- Current version

---

## Roles Allowed

Only these roles may access Platform Management:

- SUPER_ADMIN
- PLATFORM_ADMIN

Tenant users must never access Platform Management.

---

## Version 1.1 Scope

Included:
- Platform dashboard design
- Subscription plan model
- Tenant subscription model
- Manual payment tracking
- License visibility
- Platform branding
- Platform settings design

Excluded:
- Online payment gateway
- Automated invoice emails
- Automated card charging
- Full accounting integration
- AI assistant

---

## Acceptance Criteria

- Platform Admin can see SaaS-level dashboard.
- Platform Admin can assign a plan to a tenant.
- Platform Admin can track trial and subscription status.
- Platform Admin can record manual payments.
- Platform Admin can view expiring tenants.
- Tenant users cannot access platform management.
- Subscription data is tenant-scoped and auditable.
- Production build passes.
- GitHub CI passes.