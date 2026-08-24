import { Role } from "@prisma/client";

const tenantRepositoryAdministratorRoles = new Set<Role>([
  Role.SYSTEM_ADMIN,
  Role.HOA_ADMIN,
  Role.ADMIN,
]);

/**
 * Tenant administrators must retain access to the tenant-scoped repository
 * governance workspace even when a commercial feature entitlement is absent
 * or disabled. This does not grant platform-wide access: SUPER_ADMIN and
 * PLATFORM_ADMIN are intentionally excluded so tenant content remains
 * protected unless the actor also holds an explicit tenant administrator role.
 */
export function canUseTenantRepositoryWhenPlanDisabled(roles: readonly Role[]) {
  return roles.some((role) => tenantRepositoryAdministratorRoles.has(role));
}
