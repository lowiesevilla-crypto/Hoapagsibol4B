import { Suspense } from "react";
import type { Metadata } from "next";
import { TenantModule } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { adminLinks, platformLinks, systemAdminLinks } from "@/components/sidebar-links";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { filterLinksByModules, moduleForPath } from "@/lib/module-routing";
import { routeTitle, tenantMetadata, tenantNameForMetadata } from "@/lib/metadata-title";
import { userCanAccessPayroll } from "@/lib/payroll-access";
import {
  adminHomeForPermissions,
  canAccessAdminPathWithPermissions,
  filterAdminLinksByPermissions,
} from "@/lib/role-access";
import { getUnreadChatCount } from "@/lib/services/chat";
import { getAssociationSettings } from "@/lib/system-settings";
import { getEnabledTenantModules } from "@/lib/tenant";
import { getActionableDocumentRequestCount } from "@/lib/services/document-request-action-count";

export async function generateMetadata(): Promise<Metadata> {
  const user = await requirePermission(Permission.ADMIN_ACCESS);
  const pathname = (await headers()).get("x-hoa-pathname") || "/admin/dashboard";
  const association = await getAssociationSettings(user.tenantId);
  const tenantName = await tenantNameForMetadata(user.tenantId, association.name);
  return tenantMetadata(routeTitle(pathname, [...systemAdminLinks, ...adminLinks, ...platformLinks], "Dashboard"), tenantName);
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission(Permission.ADMIN_ACCESS);
  const pathname = (await headers()).get("x-hoa-pathname") || "/admin/dashboard";
  if (!canAccessAdminPathWithPermissions(user.permissions, pathname)) {
    redirect(`${adminHomeForPermissions(user.permissions)}?error=You%20do%20not%20have%20access%20to%20this%20module.`);
  }
  const platform = user.permissions.includes(Permission.PLATFORM_ACCESS);
  const enabledModules = platform
    ? new Set(Object.values(TenantModule))
    : await getEnabledTenantModules(user.tenantId);
  const requestedModule = moduleForPath(pathname);
  if (requestedModule && !enabledModules.has(requestedModule)) redirect("/admin/dashboard?error=This%20module%20is%20not%20included%20in%20your%20subscription%20plan.");
  const [association, initialChatUnreadCount, actionableDocumentRequests] = await Promise.all([
    getAssociationSettings(user.tenantId),
    getUnreadChatCount(user.id),
    user.permissions.includes(Permission.DOCUMENTS_READ)
      ? getActionableDocumentRequestCount(user.tenantId)
      : Promise.resolve(0),
  ]);
  const isSystemAdmin = user.permissions.includes(Permission.SETTINGS_MANAGE);
  const canAccessPayroll = user.permissions.includes(Permission.PAYROLL_MANAGE)
    || await userCanAccessPayroll(user.id, user.role);
  const baseLinks = isSystemAdmin ? systemAdminLinks : adminLinks;
  const linksWithPlatform = platform ? [...baseLinks, ...platformLinks] : baseLinks;
  const links = filterAdminLinksByPermissions(
    filterLinksByModules(linksWithPlatform, enabledModules),
    user.permissions,
  ).filter((item) => canAccessPayroll || !["/admin/employees", "/admin/attendance", "/admin/payroll"].includes(item.href));
  const requestBadgeHref = "/admin/documents?section=requests";
  const showDocumentRequestBadge = links.some((item) => item.href === requestBadgeHref);
  const linkBadges: Record<string, number> = showDocumentRequestBadge ? { [requestBadgeHref]: actionableDocumentRequests } : {};
  const sectionBadges: Record<string, number> = showDocumentRequestBadge ? { "Resident Services": actionableDocumentRequests } : {};
  return <div className="min-h-screen"><Sidebar user={user} links={links} roleLabel={isSystemAdmin ? "System Administrator" : "Administrator"} association={association} initialChatUnreadCount={initialChatUnreadCount} linkBadges={linkBadges} sectionBadges={sectionBadges} /><Suspense><TransactionFeedback /></Suspense><main className="mx-auto min-w-0 max-w-[1800px] px-4 py-6 sm:px-7 lg:ml-72 lg:px-10 lg:py-9">{children}</main></div>;
}
