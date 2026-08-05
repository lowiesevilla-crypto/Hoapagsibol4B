import { Role } from "@prisma/client";
import { rolePermissionsForRoles } from "@/lib/authorization/role-policy";

export type RoleAssignmentLike = {
  role: Role;
  active?: boolean;
};

const primaryRolePriority: readonly Role[] = [
  Role.SUPER_ADMIN,
  Role.PLATFORM_ADMIN,
  Role.SYSTEM_ADMIN,
  Role.HOA_ADMIN,
  Role.ADMIN,
  Role.BILLING_MANAGER,
  Role.PAYROLL_MANAGER,
  Role.STAFF,
  Role.HOMEOWNER,
  Role.EMPLOYEE,
];

export function effectiveRolesForUser(
  legacyRole: Role,
  assignments: readonly RoleAssignmentLike[] | null | undefined,
) {
  const assignedRoles = assignments
    ?.filter((assignment) => assignment.active !== false)
    .map((assignment) => assignment.role) ?? [];
  const roles = assignedRoles.length ? assignedRoles : [legacyRole];
  return [...new Set(roles)].sort((left, right) => left.localeCompare(right));
}

export function roleSnapshotForRoles(roles: readonly Role[]) {
  return [...new Set(roles)].sort((left, right) => left.localeCompare(right)).join("|");
}

export function primaryRoleForRoles(roles: readonly Role[], preferredRole?: Role) {
  if (preferredRole && roles.includes(preferredRole)) return preferredRole;
  return primaryRolePriority.find((role) => roles.includes(role)) ?? Role.HOMEOWNER;
}

export function canUseAssignedRole(roles: readonly Role[], requiredRole: Role) {
  return rolePermissionsForRoles(roles).has(requiredRole);
}

export function isPlatformRoleSet(roles: readonly Role[]) {
  return roles.includes(Role.SUPER_ADMIN) || roles.includes(Role.PLATFORM_ADMIN);
}
