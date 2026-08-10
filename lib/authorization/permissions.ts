import { Role } from "@prisma/client";

export const Permission = {
  PLATFORM_ACCESS: "platform.access",
  PLATFORM_TENANTS_MANAGE: "platform.tenants.manage",
  PLATFORM_USERS_MANAGE: "platform.users.manage",
  ADMIN_ACCESS: "admin.access",
  TENANT_SETTINGS_MANAGE: "tenant.settings.manage",
  SETTINGS_MANAGE: "settings.manage",
  USERS_MANAGE: "users.manage",
  ROLES_MANAGE: "roles.manage",
  AUDIT_READ: "audit.read",
  HOMEOWNERS_READ: "homeowners.read",
  HOMEOWNERS_MANAGE: "homeowners.manage",
  PROPERTIES_READ: "properties.read",
  PROPERTIES_MANAGE: "properties.manage",
  BILLING_READ: "billing.read",
  BILLING_MANAGE: "billing.manage",
  BILLING_CONFIGURE: "billing.configure",
  BILLING_PREVIEW: "billing.preview",
  BILLING_GENERATE: "billing.generate",
  BILLING_ADJUST: "billing.adjust",
  PAYMENTS_READ: "payments.read",
  PAYMENTS_MANAGE: "payments.manage",
  PAYMENTS_RECORD: "payments.record",
  PAYMENTS_ALLOCATE: "payments.allocate",
  PAYMENTS_VOID: "payments.void",
  PAYMENTS_REFUND: "payments.refund",
  COLLECTIONS_MANAGE: "collections.manage",
  COLLECTIONS_RECORD: "collections.record",
  COLLECTIONS_REFUND: "collections.refund",
  COLLECTIONS_FORFEIT: "collections.forfeit",
  RECEIPTS_ISSUE: "receipts.issue",
  EXPENSES_MANAGE: "expenses.manage",
  REPORTS_VIEW: "reports.view",
  REPORTS_FINANCIAL: "reports.financial",
  PAYROLL_MANAGE: "payroll.manage",
  ATTENDANCE_MANAGE: "attendance.manage",
  DOCUMENTS_READ: "documents.read",
  DOCUMENTS_REQUEST: "documents.request",
  DOCUMENTS_MANAGE: "documents.manage",
  DOCUMENTS_APPROVE: "documents.approve",
  DOCUMENT_REPOSITORY_READ: "document_repository.read",
  DOCUMENT_REPOSITORY_UPLOAD: "document_repository.upload",
  DOCUMENT_REPOSITORY_UPDATE_METADATA: "document_repository.update_metadata",
  DOCUMENT_REPOSITORY_REPLACE: "document_repository.replace",
  DOCUMENT_REPOSITORY_PUBLISH: "document_repository.publish",
  DOCUMENT_REPOSITORY_ARCHIVE: "document_repository.archive",
  DOCUMENT_REPOSITORY_DELETE: "document_repository.delete",
  DOCUMENT_REPOSITORY_DOWNLOAD_INTERNAL: "document_repository.download_internal",
  DOCUMENT_REPOSITORY_MANAGE_CATEGORIES: "document_repository.manage_categories",
  DOCUMENT_REPOSITORY_MANAGE_VISIBILITY: "document_repository.manage_visibility",
  DOCUMENT_REPOSITORY_AUDIT_READ: "document_repository.audit_read",
  DOCUMENT_REPOSITORY_STORAGE_READ: "document_repository.storage_read",
  DOCUMENT_REPOSITORY_READ_PUBLIC: "document_repository.read_public",
  COMMUNITY_MANAGE: "community.manage",
  ANNOUNCEMENTS_PUBLISH: "announcements.publish",
  COMPLAINTS_MANAGE: "complaints.manage",
  CHAT_USE: "chat.use",
  HOMEOWNER_PORTAL_ACCESS: "homeowner.portal.access",
  EMPLOYEE_PORTAL_ACCESS: "employee.portal.access",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const allPermissions = Object.freeze(Object.values(Permission));

const tenantAdministratorPermissions: readonly Permission[] = [
  Permission.ADMIN_ACCESS,
  Permission.TENANT_SETTINGS_MANAGE,
  Permission.USERS_MANAGE,
  Permission.ROLES_MANAGE,
  Permission.AUDIT_READ,
  Permission.HOMEOWNERS_READ,
  Permission.HOMEOWNERS_MANAGE,
  Permission.PROPERTIES_READ,
  Permission.PROPERTIES_MANAGE,
  Permission.BILLING_READ,
  Permission.BILLING_MANAGE,
  Permission.BILLING_CONFIGURE,
  Permission.BILLING_PREVIEW,
  Permission.BILLING_GENERATE,
  Permission.BILLING_ADJUST,
  Permission.PAYMENTS_READ,
  Permission.PAYMENTS_MANAGE,
  Permission.PAYMENTS_RECORD,
  Permission.PAYMENTS_ALLOCATE,
  Permission.PAYMENTS_VOID,
  Permission.PAYMENTS_REFUND,
  Permission.COLLECTIONS_MANAGE,
  Permission.COLLECTIONS_RECORD,
  Permission.COLLECTIONS_REFUND,
  Permission.COLLECTIONS_FORFEIT,
  Permission.RECEIPTS_ISSUE,
  Permission.EXPENSES_MANAGE,
  Permission.REPORTS_VIEW,
  Permission.REPORTS_FINANCIAL,
  Permission.PAYROLL_MANAGE,
  Permission.ATTENDANCE_MANAGE,
  Permission.DOCUMENTS_READ,
  Permission.DOCUMENTS_REQUEST,
  Permission.DOCUMENTS_MANAGE,
  Permission.DOCUMENTS_APPROVE,
  Permission.DOCUMENT_REPOSITORY_READ,
  Permission.DOCUMENT_REPOSITORY_UPLOAD,
  Permission.DOCUMENT_REPOSITORY_UPDATE_METADATA,
  Permission.DOCUMENT_REPOSITORY_REPLACE,
  Permission.DOCUMENT_REPOSITORY_PUBLISH,
  Permission.DOCUMENT_REPOSITORY_ARCHIVE,
  Permission.DOCUMENT_REPOSITORY_DELETE,
  Permission.DOCUMENT_REPOSITORY_DOWNLOAD_INTERNAL,
  Permission.DOCUMENT_REPOSITORY_MANAGE_CATEGORIES,
  Permission.DOCUMENT_REPOSITORY_MANAGE_VISIBILITY,
  Permission.DOCUMENT_REPOSITORY_AUDIT_READ,
  Permission.DOCUMENT_REPOSITORY_STORAGE_READ,
  Permission.DOCUMENT_REPOSITORY_READ_PUBLIC,
  Permission.COMMUNITY_MANAGE,
  Permission.ANNOUNCEMENTS_PUBLISH,
  Permission.COMPLAINTS_MANAGE,
  Permission.CHAT_USE,
];

const systemAdministratorPermissions: readonly Permission[] = [
  ...tenantAdministratorPermissions,
  Permission.SETTINGS_MANAGE,
];

const billingManagerPermissions: readonly Permission[] = [
  Permission.ADMIN_ACCESS,
  Permission.HOMEOWNERS_READ,
  Permission.PROPERTIES_READ,
  Permission.BILLING_READ,
  Permission.BILLING_MANAGE,
  Permission.BILLING_CONFIGURE,
  Permission.BILLING_PREVIEW,
  Permission.BILLING_GENERATE,
  Permission.BILLING_ADJUST,
  Permission.PAYMENTS_READ,
  Permission.PAYMENTS_MANAGE,
  Permission.PAYMENTS_RECORD,
  Permission.PAYMENTS_ALLOCATE,
  Permission.PAYMENTS_VOID,
  Permission.PAYMENTS_REFUND,
  Permission.COLLECTIONS_MANAGE,
  Permission.COLLECTIONS_RECORD,
  Permission.COLLECTIONS_REFUND,
  Permission.COLLECTIONS_FORFEIT,
  Permission.RECEIPTS_ISSUE,
  Permission.EXPENSES_MANAGE,
  Permission.REPORTS_VIEW,
  Permission.REPORTS_FINANCIAL,
];

export const defaultRolePermissions: Readonly<Record<Role, readonly Permission[]>> = {
  SUPER_ADMIN: allPermissions,
  PLATFORM_ADMIN: allPermissions,
  SYSTEM_ADMIN: systemAdministratorPermissions,
  HOA_ADMIN: tenantAdministratorPermissions,
  ADMIN: tenantAdministratorPermissions,
  BILLING_MANAGER: billingManagerPermissions,
  PAYROLL_MANAGER: [
    Permission.ADMIN_ACCESS,
    Permission.PAYROLL_MANAGE,
    Permission.ATTENDANCE_MANAGE,
  ],
  STAFF: [
    Permission.ADMIN_ACCESS,
    Permission.HOMEOWNERS_READ,
    Permission.PROPERTIES_READ,
    Permission.DOCUMENTS_READ,
    Permission.DOCUMENTS_REQUEST,
    Permission.DOCUMENTS_MANAGE,
    Permission.DOCUMENTS_APPROVE,
    Permission.DOCUMENT_REPOSITORY_READ,
    Permission.DOCUMENT_REPOSITORY_DOWNLOAD_INTERNAL,
    Permission.COMMUNITY_MANAGE,
    Permission.ANNOUNCEMENTS_PUBLISH,
    Permission.COMPLAINTS_MANAGE,
    Permission.CHAT_USE,
  ],
  HOMEOWNER: [
    Permission.HOMEOWNER_PORTAL_ACCESS,
    Permission.DOCUMENTS_READ,
    Permission.DOCUMENTS_REQUEST,
    Permission.DOCUMENT_REPOSITORY_READ_PUBLIC,
    Permission.CHAT_USE,
  ],
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

export function hasEveryPermission(roles: readonly Role[], permissions: readonly Permission[]) {
  const effective = permissionsForRoles(roles);
  return permissions.every((permission) => effective.has(permission));
}

export function hasAnyPermission(roles: readonly Role[], permissions: readonly Permission[]) {
  const effective = permissionsForRoles(roles);
  return permissions.some((permission) => effective.has(permission));
}
