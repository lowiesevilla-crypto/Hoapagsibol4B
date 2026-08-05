import { Role } from "@prisma/client";

export const tenantRoleHierarchy: Record<Role, Role[]> = {
  SUPER_ADMIN: [Role.SUPER_ADMIN, Role.PLATFORM_ADMIN, Role.HOA_ADMIN, Role.BILLING_MANAGER, Role.PAYROLL_MANAGER, Role.STAFF, Role.SYSTEM_ADMIN, Role.ADMIN, Role.HOMEOWNER, Role.EMPLOYEE],
  PLATFORM_ADMIN: [Role.PLATFORM_ADMIN, Role.HOA_ADMIN, Role.BILLING_MANAGER, Role.PAYROLL_MANAGER, Role.STAFF, Role.SYSTEM_ADMIN, Role.ADMIN, Role.HOMEOWNER, Role.EMPLOYEE],
  HOA_ADMIN: [Role.HOA_ADMIN, Role.ADMIN, Role.BILLING_MANAGER, Role.PAYROLL_MANAGER, Role.STAFF, Role.EMPLOYEE, Role.HOMEOWNER],
  BILLING_MANAGER: [Role.BILLING_MANAGER, Role.STAFF, Role.EMPLOYEE],
  PAYROLL_MANAGER: [Role.PAYROLL_MANAGER, Role.STAFF, Role.EMPLOYEE],
  STAFF: [Role.STAFF, Role.EMPLOYEE],
  SYSTEM_ADMIN: [Role.SYSTEM_ADMIN, Role.ADMIN, Role.HOA_ADMIN, Role.BILLING_MANAGER, Role.PAYROLL_MANAGER, Role.STAFF, Role.EMPLOYEE, Role.HOMEOWNER],
  ADMIN: [Role.ADMIN, Role.STAFF, Role.EMPLOYEE, Role.HOMEOWNER],
  HOMEOWNER: [Role.HOMEOWNER],
  EMPLOYEE: [Role.EMPLOYEE],
};

export const roleLabelMap: Record<Role, string> = {
  SUPER_ADMIN: "System Super Admin",
  PLATFORM_ADMIN: "Platform Admin",
  HOA_ADMIN: "HOA Admin",
  BILLING_MANAGER: "Billing Admin",
  PAYROLL_MANAGER: "Payroll Admin",
  STAFF: "Staff",
  SYSTEM_ADMIN: "System Admin",
  ADMIN: "Admin",
  HOMEOWNER: "Homeowner",
  EMPLOYEE: "Employee",
};

export function canAssignRole(actorRole: Role, targetRole: Role) {
  if (actorRole === Role.SUPER_ADMIN || actorRole === Role.PLATFORM_ADMIN) return targetRole !== Role.SUPER_ADMIN;
  if (actorRole === Role.HOA_ADMIN || actorRole === Role.SYSTEM_ADMIN || actorRole === Role.ADMIN) {
    return targetRole !== Role.SUPER_ADMIN && targetRole !== Role.PLATFORM_ADMIN;
  }
  return false;
}

export function rolePermissionsForRoles(roles: readonly Role[]) {
  const permissions = new Set<Role>();
  roles.forEach((role) => {
    for (const item of tenantRoleHierarchy[role] ?? []) permissions.add(item);
  });
  return permissions;
}
