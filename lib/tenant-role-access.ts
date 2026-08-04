import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export {
  canAssignRole,
  roleLabelMap,
  rolePermissionsForRoles,
  tenantRoleHierarchy,
} from "@/lib/authorization/role-policy";

export async function getUserTenantRoles(userId: string, tenantId: string) {
  const rows = await prisma.userRoleAssignment.findMany({
    where: { userId, tenantId, active: true },
    select: { role: true },
  });
  return rows.map((row) => row.role);
}

export async function userHasTenantRole(userId: string, tenantId: string, role: Role) {
  const roles = await getUserTenantRoles(userId, tenantId);
  return roles.includes(role);
}
