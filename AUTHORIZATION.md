# HOAHub Authorization Model

HOAHub uses tenant-scoped, additive permissions. A user's effective access is the union of active built-in system-role permissions and active tenant custom-role permissions.

## Core rules

1. Server actions, API routes, and protected data loaders enforce named permissions before reading or mutating sensitive records.
2. Client-side navigation filtering is supplementary only. It is never the security boundary.
3. Every tenant-owned query includes the authenticated `tenantId`; user-supplied identifiers never select across tenants.
4. Tenant custom roles cannot grant platform permissions and an administrator cannot grant a permission they do not hold.
5. Custom-role definition and assignment changes require an explicit confirmation and business reason, generate an audit event with old and new values, and revoke affected active sessions.
6. Session tokens contain system roles, effective permissions, and an authorization snapshot. Each protected request recomputes access from the database and rejects stale tokens after a role or permission change.
7. New accounts receive explicit built-in role assignments. The legacy `User.role` column remains a compatibility primary-role value, not the sole authority source.

## Built-in roles

Built-in roles provide safe default bundles for platform operators, HOA administrators, finance staff, payroll staff, general staff, homeowners, and employees. Multiple built-in roles may be active and their permissions are additive.

## Tenant custom roles

Authorized tenant administrators manage custom roles under **Settings → Roles & permissions**. A custom role has a tenant-unique name/key, description, active state, and an explicit permission list. Assignments are additive and may be removed without deleting audit history.

Platform permissions (`platform.*` and `platform.access`) are excluded from tenant custom roles by construction.

## High-risk permissions

High-risk grants include role/user administration, data import/migration, billing generation/adjustment, payment recording/allocation/void/refund, collection refund/forfeiture, receipt issuance, document approval/configuration/generation/archive, and document balance overrides.

The administration UI labels these permissions and requires the administrator to confirm the impact and enter a reason of at least ten characters before saving.

## Permission-change behavior

When a built-in or custom role changes:

- old and new roles/permissions are written to the authorization audit log;
- the stated reason and actor are recorded;
- target users' active sessions are revoked;
- any unrevoked stale token is rejected by authorization-snapshot comparison;
- the next login receives the current effective permission set.

## Development checklist

For every new privileged capability:

- add a named permission to `lib/authorization/permissions.ts`;
- assign it only to required built-in roles;
- classify its risk in `lib/authorization/permission-risk.ts`;
- enforce it with `requirePermission`, `requirePermissions`, or `requireAnyPermission` on the server;
- scope all tenant records to `user.tenantId`;
- add allowed, denied, cross-tenant, and stale-session tests;
- include reason/confirmation and audit old/new values for destructive or authorization-changing operations.
