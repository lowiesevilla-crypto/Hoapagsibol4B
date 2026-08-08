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
  ["/admin/profile", Permission.ADMIN_ACCESS],
  ["/admin/onboarding", Permission.TENANT_SETTINGS_MANAGE],
  ["/admin/settings/billing-rules", Permission.BILLING_MANAGE],
  ["/admin/settings/billing-exemptions", Permission.BILLING_MANAGE],
  ["/admin/settings", Permission.TENANT_SETTINGS_MANAGE],
  ["/admin/homeowners", Permission.HOMEOWNERS_MANAGE],
  ["/admin/employees", Permission.PAYROLL_MANAGE],
  ["/admin/attendance", Permission.ATTENDANCE_MANAGE],
  ["/admin/payroll", Permission.PAYROLL_MANAGE],
  ["/admin/billing", Permission.BILLING_MANAGE],
  ["/admin/payments", Permission.PAYMENTS_MANAGE],
  ["/admin/receipts", Permission.PAYMENTS_MANAGE],
  ["/admin/collections", Permission.COLLECTIONS_MANAGE],
  ["/admin/expenses", Permission.EXPENSES_MANAGE],
  ["/admin/reports", Permission.REPORTS_VIEW],
  ["/admin/documents", Permission.DOCUMENTS_MANAGE],
  ["/admin/document-templates", Permission.DOCUMENTS_MANAGE],
  ["/admin/complaints", Permission.COMPLAINTS_MANAGE],
  ["/admin/announcements", Permission.COMMUNITY_MANAGE],
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

export function filterAdminLinksByRole(links: LinkItem[], roleOrRoles: Role | readonly Role[]) {
  return links.filter((link) => canAccessAdminPath(roleOrRoles, link.href));
}

export function adminHomeForRole(roleOrRoles: Role | readonly Role[]) {
  const roles = normalizeRoles(roleOrRoles);
  if (hasPermission(roles, Permission.TENANT_SETTINGS_MANAGE)) return "/admin/dashboard";
  if (hasPermission(roles, Permission.BILLING_MANAGE)) return "/admin/billing";
  if (hasPermission(roles, Permission.PAYROLL_MANAGE)) return "/admin/payroll";
  if (hasPermission(roles, Permission.CHAT_USE)) return "/admin/chat";
  return "/admin/dashboard";
}