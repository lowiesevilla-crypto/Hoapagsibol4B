import { Role } from "@prisma/client";

export const tenantAccessRoles: Role[] = [
  Role.SYSTEM_ADMIN,
  Role.HOA_ADMIN,
  Role.BILLING_MANAGER,
  Role.PAYROLL_MANAGER,
  Role.STAFF,
  Role.ADMIN,
];

export const tenantUserRoles: Role[] = [
  ...tenantAccessRoles,
  Role.HOMEOWNER,
  Role.EMPLOYEE,
];

export function roleLabel(role: Role) {
  return role.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
