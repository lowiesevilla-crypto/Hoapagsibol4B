import { Role } from "@prisma/client";
import type { LinkItem } from "@/components/sidebar-links";
import {
  hasPermission,
  Permission,
  type Permission as PermissionValue,
} from "@/lib/authorization/permissions";

const unrestrictedAdminRoles = new Set<Role>([
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
  Role.HOA_ADMIN,
  Role.ADMIN,
]);

const adminRoutePermissions: readonly [string, PermissionValue][] = [
  ["/admin/settings/billing-rules", Permission.BILLING_CONFIGURE],
  ["/admin/settings/billing-exemptions", Permission.BILLING_CONFIGURE],
  ["/admin/settings/document-definitions", Permission.DOCUMENTS_CONFIGURE],
  ["/admin/settings/document-templates", Permission.DOCUMENTS_CONFIGURE],
  ["/admin/settings/document-types", Permission.DOCUMENTS_CONFIGURE],
  ["/admin/settings/roles", Permission.ROLES_MANAGE],
  ["/admin/settings/organization", Permission.SETTINGS_MANAGE],
  ["/admin/settings", Permission.TENANT_SETTINGS_MANAGE],
  ["/admin/homeowners", Permission.HOMEOWNERS_READ],
  ["/admin/employees", Permission.PAYROLL_MANAGE],
  ["/admin/attendance", Permission.ATTENDANCE_MANAGE],
  ["/admin/payroll", Permission.PAYROLL_MANAGE],
  ["/admin/billing", Permission.BILLING_READ],
  ["/admin/payments/record", Permission.PAYMENTS_RECORD],
  ["/admin/payments", Permission.PAYMENTS_READ],
  ["/admin/receipts", Permission.PAYMENTS_READ],
  ["/admin/collections", Permission.COLLECTIONS_MANAGE],
  ["/admin/expenses", Permission.EXPENSES_MANAGE],
  ["/admin/reports/dashboard", Permission.REPORTS_FINANCIAL],
  ["/admin/reports", Permission.REPORTS_VIEW],
  ["/admin/data/migrations", Permission.DATA_MIGRATE],
  ["/admin/data", Permission.DATA_EXPORT],
  ["/admin/documents/new", Permission.DOCUMENTS_GENERATE],
  ["/admin/documents", Permission.DOCUMENTS_READ],
  ["/admin/document-templates", Permission.DOCUMENTS_CONFIGURE],
  ["/admin/complaints", Permission.COMPLAINTS_MANAGE],
  ["/admin/announcements", Permission.ANNOUNCEMENTS_PUBLISH],
  ["/admin/events", Permission.COMMUNITY_MANAGE],
  ["/admin/chat", Permission.CHAT_USE],
  ["/admin/dashboard", Permission.ADMIN_ACCESS],
];

function normalizeRoles(roleOrRoles: Role | readonly Role[]) {
  return typeof roleOrRoles === "string"
    ? [roleOrRoles]
    : [...new Set(roleOrRoles)];
}

export function requiredPermissionForAdminPath(pathname: string) {
  const path = pathname.split(/[?#]/)[0];
  return adminRoutePermissions.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? null;
}

export function adminPrefixesForRole(role: Role) {
  if (unrestrictedAdminRoles.has(role)) return null;
  return adminRoutePermissions
    .filter(([, permission]) => hasPermission([role], permission))
    .map(([prefix]) => prefix);
}

export function canAccessAdminPath(roleOrRoles: Role | readonly Role[], pathname: string) {
  const roles = normalizeRoles(roleOrRoles);
  const requiredPermission = requiredPermissionForAdminPath(pathname);
  if (requiredPermission) return hasPermission(roles, requiredPermission);
  return roles.some((role) => unrestrictedAdminRoles.has(role));
}

export function canAccessAdminPathWithPermissions(
  permissions: readonly PermissionValue[],
  pathname: string,
) {
  const requiredPermission = requiredPermissionForAdminPath(pathname);
  return requiredPermission ? permissions.includes(requiredPermission) : permissions.includes(Permission.ADMIN_ACCESS);
}

export function filterAdminLinksByRole(links: LinkItem[], roleOrRoles: Role | readonly Role[]) {
  return links.filter((link) => canAccessAdminPath(roleOrRoles, link.href));
}

export function filterAdminLinksByPermissions(
  links: LinkItem[],
  permissions: readonly PermissionValue[],
) {
  return links.filter((link) => canAccessAdminPathWithPermissions(permissions, link.href));
}

export function adminHomeForRole(roleOrRoles: Role | readonly Role[]) {
  const roles = normalizeRoles(roleOrRoles);
  if (hasPermission(roles, Permission.TENANT_SETTINGS_MANAGE)) return "/admin/dashboard";
  if (hasPermission(roles, Permission.BILLING_MANAGE)) return "/admin/billing";
  if (hasPermission(roles, Permission.PAYROLL_MANAGE)) return "/admin/payroll";
  if (hasPermission(roles, Permission.CHAT_USE)) return "/admin/chat";
  return "/admin/dashboard";
}

export function adminHomeForPermissions(permissions: readonly PermissionValue[]) {
  if (permissions.includes(Permission.ADMIN_ACCESS)) return "/admin/dashboard";
  if (permissions.includes(Permission.BILLING_READ)) return "/admin/billing";
  if (permissions.includes(Permission.PAYROLL_MANAGE)) return "/admin/payroll";
  if (permissions.includes(Permission.CHAT_USE)) return "/admin/chat";
  return "/admin/dashboard";
}
