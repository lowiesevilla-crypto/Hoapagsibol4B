import { Role } from "@prisma/client";

export const Permission = {
  PLATFORM_ACCESS: "platform.access",
  PLATFORM_TENANTS_MANAGE: "platform.tenants.manage",
  PLATFORM_USERS_MANAGE: "platform.users.manage",
  ADMIN_ACCESS: "admin.access",
  TENANT_SETTINGS_MANAGE: "tenant.settings.manage",
  HOMEOWNERS_MANAGE: "homeowners.manage",
  BILLING_MANAGE: "billing.manage",
  PAYMENTS_MANAGE: "payments.manage",
  COLLECTIONS_MANAGE: "collections.manage",
  EXPENSES_MANAGE: "expenses.manage",
  REPORTS_VIEW: "reports.view",
  PAYROLL_MANAGE: "payroll.manage",
  ATTENDANCE_MANAGE: "attendance.manage",
  DOCUMENTS_MANAGE: "documents.manage",
  COMMUNITY_MANAGE: "community.manage",
  COMPLAINTS_MANAGE: "complaints.manage",
  CHAT_USE: "chat.use",
  HOMEOWNER_PORTAL_ACCESS: "homeowner.portal.access",
  EMPLOYEE_PORTAL_ACCESS: "employee.portal.access",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const allPermissions = Object.freeze(Object.values(Permission));

export const defaultRolePermissions: Readonly<Record<Role, readonly Permission[]>> = {
  SUPER_ADMIN: allPermissions,
  PLATFORM_ADMIN: allPermissions,
  SYSTEM_ADMIN: [
    Permission.ADMIN_ACCESS,
    Permission.TENANT_SETTINGS_MANAGE,
    Permission.HOMEOWNERS_MANAGE,
    Permission.BILLING_MANAGE,
    Permission.PAYMENTS_MANAGE,
    Permission.COLLECTIONS_MANAGE,
    Permission.EXPENSES_MANAGE,
    Permission.REPORTS_VIEW,
    Permission.PAYROLL_MANAGE,
    Permission.ATTENDANCE_MANAGE,
    Permission.DOCUMENTS_MANAGE,
    Permission.COMMUNITY_MANAGE,
    Permission.COMPLAINTS_MANAGE,
    Permission.CHAT_USE,
  ],
  HOA_ADMIN: [
    Permission.ADMIN_ACCESS,
    Permission.TENANT_SETTINGS_MANAGE,
    Permission.HOMEOWNERS_MANAGE,
    Permission.BILLING_MANAGE,
    Permission.PAYMENTS_MANAGE,
    Permission.COLLECTIONS_MANAGE,
    Permission.EXPENSES_MANAGE,
    Permission.REPORTS_VIEW,
    Permission.PAYROLL_MANAGE,
    Permission.ATTENDANCE_MANAGE,
    Permission.DOCUMENTS_MANAGE,
    Permission.COMMUNITY_MANAGE,
    Permission.COMPLAINTS_MANAGE,
    Permission.CHAT_USE,
  ],
  ADMIN: [
    Permission.ADMIN_ACCESS,
    Permission.TENANT_SETTINGS_MANAGE,
    Permission.HOMEOWNERS_MANAGE,
    Permission.BILLING_MANAGE,
    Permission.PAYMENTS_MANAGE,
    Permission.COLLECTIONS_MANAGE,
    Permission.EXPENSES_MANAGE,
    Permission.REPORTS_VIEW,
    Permission.PAYROLL_MANAGE,
    Permission.ATTENDANCE_MANAGE,
    Permission.DOCUMENTS_MANAGE,
    Permission.COMMUNITY_MANAGE,
    Permission.COMPLAINTS_MANAGE,
    Permission.CHAT_USE,
  ],
  BILLING_MANAGER: [
    Permission.ADMIN_ACCESS,
    Permission.BILLING_MANAGE,
    Permission.PAYMENTS_MANAGE,
    Permission.COLLECTIONS_MANAGE,
    Permission.EXPENSES_MANAGE,
    Permission.REPORTS_VIEW,
  ],
  PAYROLL_MANAGER: [
    Permission.ADMIN_ACCESS,
    Permission.PAYROLL_MANAGE,
    Permission.ATTENDANCE_MANAGE,
  ],
  STAFF: [
    Permission.ADMIN_ACCESS,
    Permission.DOCUMENTS_MANAGE,
    Permission.COMMUNITY_MANAGE,
    Permission.COMPLAINTS_MANAGE,
    Permission.CHAT_USE,
  ],
  HOMEOWNER: [Permission.HOMEOWNER_PORTAL_ACCESS, Permission.CHAT_USE],
  EMPLOYEE: [Permission.EMPLOYEE_PORTAL_ACCESS, Permission.CHAT_USE],
};

export function permissionsForRoles(roles: readonly Role[]) {
  const permissions = new Set<Permission>();
  for (const role of roles) {
    for (const permission of defaultRolePermissions[role] ?? []) permissions.add(permission);
  }
  return permissions;
}

export function hasPermission(roles: readonly Role[], permission: Permission) {
  return permissionsForRoles(roles).has(permission);
}

export function hasAnyPermission(roles: readonly Role[], permissions: readonly Permission[]) {
  const effective = permissionsForRoles(roles);
  return permissions.some((permission) => effective.has(permission));
}
