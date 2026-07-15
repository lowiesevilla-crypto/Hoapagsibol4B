import { Role } from "@prisma/client";
import type { LinkItem } from "@/components/sidebar-links";

const unrestrictedAdminRoles = new Set<Role>([
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
  Role.HOA_ADMIN,
  Role.ADMIN,
]);

const payrollManagerAllowedAdminPrefixes = [
  "/admin/employees",
  "/admin/attendance",
  "/admin/payroll",
];

const billingManagerAllowedAdminPrefixes = [
  "/admin/billing",
  "/admin/settings/billing-rules",
  "/admin/settings/billing-exemptions",
  "/admin/payments",
  "/admin/receipts",
  "/admin/collections",
  "/admin/expenses",
  "/admin/reports/dashboard",
];

const staffAllowedAdminPrefixes = [
  "/admin/dashboard",
  "/admin/chat",
  "/admin/announcements",
  "/admin/events",
  "/admin/documents",
];

export function adminPrefixesForRole(role: Role) {
  if (unrestrictedAdminRoles.has(role)) return null;
  if (role === Role.PAYROLL_MANAGER) return payrollManagerAllowedAdminPrefixes;
  if (role === Role.BILLING_MANAGER) return billingManagerAllowedAdminPrefixes;
  if (role === Role.STAFF) return staffAllowedAdminPrefixes;
  return [];
}

export function canAccessAdminPath(role: Role, pathname: string) {
  const prefixes = adminPrefixesForRole(role);
  if (prefixes === null) return true;
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function filterAdminLinksByRole(links: LinkItem[], role: Role) {
  const prefixes = adminPrefixesForRole(role);
  if (prefixes === null) return links;
  return links.filter((link) => prefixes.some((prefix) => link.href === prefix || link.href.startsWith(`${prefix}/`)));
}

export function adminHomeForRole(role: Role) {
  if (role === Role.PAYROLL_MANAGER) return "/admin/payroll";
  if (role === Role.BILLING_MANAGER) return "/admin/billing";
  if (role === Role.STAFF) return "/admin/chat";
  return "/admin/dashboard";
}
