# HOAHub Authorization and Permission Model

## Authority sources

`UserRoleAssignment` is the runtime authority source for user roles. A user may have multiple active assignments and receives the additive union of their default role permissions.

`User.role` remains temporarily available as a compatibility primary role. It is used only when a user has no active assignments and must not be treated as the complete authorization decision for new code.

## Resolution rules

1. Load active `UserRoleAssignment` rows for the authenticated tenant and user.
2. When at least one active assignment exists, ignore `User.role` for authority decisions.
3. When no active assignment exists, use `User.role` as the migration fallback.
4. Deduplicate and sort roles before calculating the session role snapshot.
5. Calculate effective permissions as the union of the default permission matrix for every effective role.
6. Keep tenant scope and module entitlements as independent mandatory checks.

## Session behavior

New session tokens contain:

- a compatibility primary role;
- the full effective role list;
- a deterministic role snapshot;
- the tenant and server-side session identifier.

`requireUser()` reloads active assignments on every protected request. A changed snapshot, removed primary role, revoked session, inactive user, or tenant mismatch invalidates the request. Role-assignment mutations also revoke all active sessions atomically.

Older signed sessions without a role snapshot remain compatible only while their primary role is still effective. Assignment-management actions revoke those sessions when access changes.

## Permission catalog

The catalog is defined in `lib/authorization/permissions.ts`. Permission names are stable business capabilities such as:

- `platform.users.manage`
- `tenant.settings.manage`
- `billing.manage`
- `payments.manage`
- `payroll.manage`
- `documents.manage`
- `homeowner.portal.access`

Route and navigation checks use these capabilities after server-side authentication. UI filtering is not an authorization boundary by itself.

## Assignment management

The platform tenant-user screen supports multiple role checkboxes. Saving the assignment set:

- validates the actor's tenant/platform authority;
- validates every requested role against the actor's grant boundary;
- reactivates or creates selected assignments;
- deactivates removed assignments;
- updates `User.role` only as the compatibility primary role;
- revokes active sessions;
- records old roles, new roles, compatibility primary role, and revoked-session count in the audit log.

Users cannot modify their own role set through this screen.

## Migration

Migration `20260805143000_backfill_user_role_assignments` inserts each existing `User.role` into `UserRoleAssignment` idempotently. New platform-created users and the bootstrap seed create their initial assignment explicitly.

## Development rule

New privileged server actions and API routes should require a named permission after `requireUser()` and must retain tenant, ownership, subscription-module, and audit checks. Do not add new authorization branches based only on `user.role`.
