import type { Role } from "@prisma/client";
import { roleSnapshotForRoles } from "@/lib/authorization/effective-access";
import {
  isPermission,
  permissionValues,
  permissionsForRoles,
  Permission,
  type Permission as PermissionValue,
} from "@/lib/authorization/permissions";

export type CustomRolePermissionLike = { permission: string };

export type CustomRoleAssignmentLike = {
  active?: boolean;
  role: {
    id: string;
    key?: string;
    name?: string;
    active?: boolean;
    updatedAt?: Date | string;
    permissions: readonly CustomRolePermissionLike[];
  };
};

export const tenantAssignablePermissions: readonly PermissionValue[] = permissionValues.filter(
  (permission) => permission !== Permission.PLATFORM_ACCESS && !permission.startsWith("platform."),
);

export function activeCustomRoleAssignments(
  assignments: readonly CustomRoleAssignmentLike[] | null | undefined,
) {
  return (assignments ?? []).filter(
    (assignment) => assignment.active !== false && assignment.role.active !== false,
  );
}

export function customPermissionsForAssignments(
  assignments: readonly CustomRoleAssignmentLike[] | null | undefined,
) {
  const permissions = new Set<PermissionValue>();
  for (const assignment of activeCustomRoleAssignments(assignments)) {
    for (const item of assignment.role.permissions) {
      if (isPermission(item.permission)) permissions.add(item.permission);
    }
  }
  return permissions;
}

export function effectivePermissionsForAccess(
  roles: readonly Role[],
  assignments: readonly CustomRoleAssignmentLike[] | null | undefined,
) {
  const permissions = permissionsForRoles(roles);
  for (const permission of customPermissionsForAssignments(assignments)) permissions.add(permission);
  return permissions;
}

export function authorizationSnapshotForAccess(
  roles: readonly Role[],
  assignments: readonly CustomRoleAssignmentLike[] | null | undefined,
) {
  const active = activeCustomRoleAssignments(assignments);
  const roleState = active
    .map((assignment) => {
      const timestamp = assignment.role.updatedAt instanceof Date
        ? assignment.role.updatedAt.toISOString()
        : String(assignment.role.updatedAt ?? "");
      const permissions = assignment.role.permissions
        .map((item) => item.permission)
        .filter(isPermission)
        .sort((left, right) => left.localeCompare(right))
        .join(",");
      return `${assignment.role.id}:${timestamp}:${permissions}`;
    })
    .sort((left, right) => left.localeCompare(right))
    .join("|");
  const permissions = [...effectivePermissionsForAccess(roles, assignments)]
    .sort((left, right) => left.localeCompare(right))
    .join(",");
  return `${roleSnapshotForRoles(roles)}#${roleState}#${permissions}`;
}

export function normalizePermissionSelection(values: readonly string[]) {
  return [...new Set(values.filter(isPermission))]
    .filter((permission) => tenantAssignablePermissions.includes(permission))
    .sort((left, right) => left.localeCompare(right));
}
